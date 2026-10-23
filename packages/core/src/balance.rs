//! A batch with collateral: an order only crosses if its market is in the batch and its
//! account can cover its worst case.

use crate::clearing::{Fill, clear, clearing_price};
use crate::order::Order;
use crate::{ACCOUNT_LEN, Key};

/// One row of the relayers' balance table.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Account {
    /// The account's public label (`BLAKE2b("zPredictAccount1", key)[..8]`, made by the
    /// browser): what relayers credit deposits to and serve balances by. It spends nothing.
    pub id: u64,
    /// The credential, held by relayers only as XOR shares: an order or withdrawal uses
    /// this row only if it carries the same key.
    pub key: Key,
    /// Half-ticks: 1 unit of collateral = 200.
    pub balance: u64,
}

impl Account {
    /// Little-endian layout: id(8) balance(8). Relayers XOR-share rows like orders; the
    /// key is shared separately. An all-zero row is padding.
    pub fn encode(&self) -> [u8; ACCOUNT_LEN] {
        let mut b = [0u8; ACCOUNT_LEN];
        b[0..8].copy_from_slice(&self.id.to_le_bytes());
        b[8..16].copy_from_slice(&self.balance.to_le_bytes());
        b
    }
}

/// The most an order can pay: `size × 2 × price` half-ticks. A fill costs
/// `p + 100 - q` (YES) or `q + 100 - p` (NO) per contract, and crossing means the
/// counterparty's price is at least `100 - own price`, so neither exceeds `2 × own price`.
pub fn worst_case_cost(o: &Order) -> u64 {
    o.size as u64 * 2 * o.price as u64
}

/// What one batch produces.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Cleared {
    pub fills: Vec<Fill>,
    /// Every account row's new balance, in table order.
    pub balances: Vec<u64>,
    /// [`clearing_price`] of each market slot's fills, in `markets` order; public.
    pub prices: Vec<Option<u16>>,
}

/// [`clear`] for a batch holding several markets, with collateral.
///
/// `markets` lists the batch's markets; `0` marks an unused slot. Orders for any market
/// not listed are dummies. Then, in batch order, each order reserves its
/// [`worst_case_cost`] from the first account row whose key matches its `key`. An
/// order with no matching row, or whose worst case exceeds what is left after earlier
/// orders' reservations (across all markets), becomes a size-0 dummy. Each market's
/// survivors are cleared with [`clear`] on their own, and each account is debited what
/// its orders actually paid, which never exceeds what they reserved.
pub fn clear_with_balances(markets: &[u32], batch: &[Order], accounts: &[Account]) -> Cleared {
    let row = |o: &Order| accounts.iter().position(|a| a.key == o.key);
    let mut left: Vec<u64> = accounts.iter().map(|a| a.balance).collect();
    let funded: Vec<Order> = batch
        .iter()
        .map(|o| {
            let mut o = *o;
            if o.market == 0 || !markets.contains(&o.market) {
                o.size = 0;
            }
            let need = worst_case_cost(&o);
            match row(&o) {
                Some(r) if need <= left[r] => left[r] -= need,
                _ => o.size = 0,
            }
            o
        })
        .collect();
    let only = |m: u32| -> Vec<Order> {
        let pick = |o: &Order| Order {
            size: if o.market == m { o.size } else { 0 },
            ..*o
        };
        funded.iter().map(pick).collect()
    };
    let mut distinct: Vec<u32> = markets.iter().copied().filter(|&m| m != 0).collect();
    distinct.sort_unstable();
    distinct.dedup();
    let fills: Vec<Fill> = distinct.iter().flat_map(|&m| clear(&only(m))).collect();
    let mut balances: Vec<u64> = accounts.iter().map(|a| a.balance).collect();
    for f in &fills {
        for (i, cost) in [(f.yes, f.yes_cost), (f.no, f.no_cost)] {
            let r = row(&funded[i]).expect("only funded orders fill");
            balances[r] -= f.size as u64 * cost as u64;
        }
    }
    let prices = markets
        .iter()
        .map(|&m| {
            let of_m: Vec<Fill> = fills
                .iter()
                .filter(|f| m != 0 && funded[f.yes].market == m)
                .copied()
                .collect();
            clearing_price(&of_m)
        })
        .collect();
    Cleared {
        fills,
        balances,
        prices,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::order::{Side, test_order as o};

    /// Account `n`'s row: id `n`, key `[n; 16]`.
    fn acct(n: u8, balance: u64) -> Account {
        let (id, key) = (n.into(), [n; 16]);
        Account { id, key, balance }
    }

    fn with_account(mut ord: Order, n: u8) -> Order {
        ord.key = [n; 16];
        ord
    }

    /// The fixture market is 7; 8 rides along with no orders, and one slot is unused.
    fn run(batch: &[Order], accounts: &[Account]) -> Cleared {
        clear_with_balances(&[7, 8, 0], batch, accounts)
    }

    #[test]
    fn funded_orders_clear_like_clear_and_pay_actual_cost() {
        let batch = [o(Side::Yes, 60, 3), with_account(o(Side::No, 45, 3), 9)];
        let c = run(&batch, &[acct(42, 360), acct(9, 270)]);
        assert_eq!(c.fills, clear(&batch));
        // Worst cases 3×120 and 3×90 are covered exactly; actual costs 3×115 and 3×85.
        assert_eq!(c.balances, vec![360 - 345, 270 - 255]);
        assert_eq!(c.prices, vec![Some(115), None, None]);
    }

    #[test]
    fn short_balance_or_unknown_account_makes_a_dummy() {
        let batch = [o(Side::Yes, 60, 3), with_account(o(Side::No, 45, 3), 9)];
        let c = run(&batch, &[acct(42, 359), acct(9, 270)]);
        assert!(c.fills.is_empty(), "YES needs 360, has 359");
        assert_eq!((c.balances, c.prices), (vec![359, 270], vec![None; 3]));
        assert!(
            run(&batch, &[acct(42, 1000)]).fills.is_empty(),
            "no row for 9"
        );
    }

    /// Regression #49: orders in different markets never cross; one price per market.
    #[test]
    fn markets_clear_apart_with_their_own_prices() {
        let in_market = |mut ord: Order, m: u32| {
            ord.market = m;
            ord
        };
        let batch = [
            o(Side::Yes, 60, 3),
            in_market(o(Side::Yes, 90, 1), 8),
            with_account(o(Side::No, 45, 3), 9),
            with_account(in_market(o(Side::No, 30, 1), 8), 9),
        ];
        let c = run(&batch, &[acct(42, 1000), acct(9, 1000)]);
        // 7: YES 60 × NO 45 at 115. 8: YES 90 × NO 30 at 160. Never YES 90 × NO 45.
        assert_eq!(c.prices, vec![Some(115), Some(160), None]);
        assert_eq!(c.fills.len(), 2);
        assert!(
            c.fills
                .iter()
                .all(|f| batch[f.yes].market == batch[f.no].market)
        );
    }

    #[test]
    fn unlisted_markets_are_dummies_and_reserve_nothing() {
        let mut other = o(Side::Yes, 99, 5);
        other.market = 9; // not in [7, 8, 0]: reserves nothing, so the next order fits
        let batch = [
            other,
            o(Side::Yes, 60, 3),
            with_account(o(Side::No, 45, 3), 9),
        ];
        let c = run(&batch, &[acct(42, 360), acct(9, 1000)]);
        assert_eq!(c.fills.len(), 1);
        assert_eq!(c.balances, vec![360 - 345, 1000 - 255]);
    }

    #[test]
    fn one_account_reserves_in_batch_order() {
        // Account 42 holds 200: the first order reserves 2×50, the second needs 2×60.
        let batch = [
            o(Side::Yes, 50, 1),
            o(Side::Yes, 60, 1),
            with_account(o(Side::No, 50, 2), 9),
        ];
        let c = run(&batch, &[acct(42, 200), acct(9, 1000)]);
        assert_eq!(c.fills.len(), 1);
        assert_eq!((c.fills[0].yes, c.fills[0].size), (0, 1));
        assert_eq!(c.balances, vec![200 - 100, 1000 - 100]);
    }

    #[test]
    fn first_matching_row_wins() {
        let batch = [o(Side::Yes, 50, 1), with_account(o(Side::No, 50, 1), 9)];
        let c = run(&batch, &[acct(42, 100), acct(42, 500), acct(9, 100)]);
        assert_eq!(c.balances, vec![0, 500, 0]);
    }
}
