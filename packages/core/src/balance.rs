//! One market's batch with collateral: an order only crosses if it is for the batch's
//! market and its account can cover its worst case.

use crate::ACCOUNT_LEN;
use crate::clearing::{Fill, clear, clearing_price};
use crate::order::Order;

/// One row of the relayers' balance table.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Account {
    /// The account tag's first 8 bytes as `u64`, as in [`Order::account`].
    pub id: u64,
    /// Half-ticks: 1 unit of collateral = 200.
    pub balance: u64,
}

impl Account {
    /// Little-endian layout: id(8) balance(8). Relayers XOR-share rows like orders.
    /// An all-zero row is padding: free to give to a new account.
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
    /// [`clearing_price`] of `fills`; public.
    pub price: Option<u16>,
}

/// [`clear`] for one market's batch, with collateral.
///
/// Orders for any other `market` are dummies. Then, in batch order, each order reserves
/// its [`worst_case_cost`] from the first account row whose id matches its `account`.
/// An order with no matching row, or whose worst case exceeds what is left after earlier
/// orders' reservations, becomes a size-0 dummy. The survivors are cleared with
/// [`clear`], and each account is debited what its orders actually paid, which never
/// exceeds what they reserved.
pub fn clear_with_balances(market: u32, batch: &[Order], accounts: &[Account]) -> Cleared {
    let row = |o: &Order| accounts.iter().position(|a| a.id == o.account);
    let mut left: Vec<u64> = accounts.iter().map(|a| a.balance).collect();
    let funded: Vec<Order> = batch
        .iter()
        .map(|o| {
            let mut o = *o;
            if o.market != market {
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
    let fills = clear(&funded);
    let mut balances: Vec<u64> = accounts.iter().map(|a| a.balance).collect();
    for f in &fills {
        for (i, cost) in [(f.yes, f.yes_cost), (f.no, f.no_cost)] {
            let r = row(&funded[i]).expect("only funded orders fill");
            balances[r] -= f.size as u64 * cost as u64;
        }
    }
    let price = clearing_price(&fills);
    Cleared {
        fills,
        balances,
        price,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::order::{Side, test_order as o};

    fn acct(id: u64, balance: u64) -> Account {
        Account { id, balance }
    }

    fn with_account(mut ord: Order, account: u64) -> Order {
        ord.account = account;
        ord
    }

    /// The fixture market is 7.
    fn run(batch: &[Order], accounts: &[Account]) -> Cleared {
        clear_with_balances(7, batch, accounts)
    }

    #[test]
    fn funded_orders_clear_like_clear_and_pay_actual_cost() {
        let batch = [o(Side::Yes, 60, 3), with_account(o(Side::No, 45, 3), 9)];
        let c = run(&batch, &[acct(42, 360), acct(9, 270)]);
        assert_eq!(c.fills, clear(&batch));
        // Worst cases 3×120 and 3×90 are covered exactly; actual costs 3×115 and 3×85.
        assert_eq!(c.balances, vec![360 - 345, 270 - 255]);
        assert_eq!(c.price, Some(115));
    }

    #[test]
    fn short_balance_or_unknown_account_makes_a_dummy() {
        let batch = [o(Side::Yes, 60, 3), with_account(o(Side::No, 45, 3), 9)];
        let c = run(&batch, &[acct(42, 359), acct(9, 270)]);
        assert!(c.fills.is_empty(), "YES needs 360, has 359");
        assert_eq!((c.balances, c.price), (vec![359, 270], None));
        assert!(
            run(&batch, &[acct(42, 1000)]).fills.is_empty(),
            "no row for 9"
        );
    }

    #[test]
    fn other_markets_are_dummies() {
        let mut other = with_account(o(Side::No, 45, 3), 9);
        other.market = 8;
        let c = run(
            &[o(Side::Yes, 60, 3), other],
            &[acct(42, 1000), acct(9, 1000)],
        );
        assert!(c.fills.is_empty());
        assert_eq!(c.balances, vec![1000, 1000], "nothing reserved or debited");
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
