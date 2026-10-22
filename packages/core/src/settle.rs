//! Money in and out of the balance table, outside order matching: deposits and
//! withdrawals before a batch clears ([`apply_flows`]), and winners' payouts once a
//! market resolves ([`resolve`]). The circuits mirror both.

use crate::balance::Account;
use crate::order::{Order, Side};
use crate::{FILL_LEN, HALF_TICKS_PER_UNIT, Key};

/// One withdrawal request: the account's key (secret-shared in the circuit, like an
/// order's) and the amount in half-ticks (public: the payout needs it). Amount 0 is an
/// unused slot.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Withdrawal {
    pub key: Key,
    pub amount: u64,
}

/// Adds `credits[r]` to row `r` (deposits are public to every relayer anyway), then, in
/// slot order, takes each withdrawal from the first row with its key only if that row
/// covers it. Returns the new table and, per slot, whether the withdrawal went through.
/// Relayers learn amounts and the `ok` bits, never whose withdrawal it was.
pub fn apply_flows(
    accounts: &[Account],
    credits: &[u64],
    withdrawals: &[Withdrawal],
) -> (Vec<Account>, Vec<bool>) {
    let mut table: Vec<Account> = (accounts.iter().zip(credits))
        .map(|(a, c)| Account {
            balance: a.balance + c,
            ..*a
        })
        .collect();
    let ok = withdrawals
        .iter()
        .map(|w| {
            let row = table.iter().position(|a| a.key == w.key);
            match row {
                Some(r) if w.amount > 0 && table[r].balance >= w.amount => {
                    table[r].balance -= w.amount;
                    true
                }
                _ => false,
            }
        })
        .collect();
    (table, ok)
}

/// New balances once `market` resolves to `outcome`: every position (an order and its
/// combined fill record) that filled on the winning side in that market pays its size in
/// units (one unit per contract, 200 half-ticks) into the first row with its key.
/// Positions in other markets, losers and unfilled orders pay nothing. Run it exactly
/// once per market: positions are not consumed.
pub fn resolve(
    market: u32,
    outcome: Side,
    positions: &[(Order, [u8; FILL_LEN])],
    accounts: &[Account],
) -> Vec<u64> {
    let mut balances: Vec<u64> = accounts.iter().map(|a| a.balance).collect();
    for (o, record) in positions {
        let size = u32::from_le_bytes(record[0..4].try_into().expect("4 bytes"));
        let wins = o.market == market && record[9] & 1 == 1 && record[8] == outcome as u8;
        let row = accounts.iter().position(|a| a.key == o.key);
        if let (true, Some(r)) = (wins, row) {
            balances[r] += u64::from(size) * HALF_TICKS_PER_UNIT;
        }
    }
    balances
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::order::test_order as o;
    use crate::{clear, fill_records};

    #[test]
    fn credits_then_withdrawals_that_fit() {
        let w = |n: u8, amount| Withdrawal {
            key: [n; 16],
            amount,
        };
        let acct = |n: u8, balance| Account {
            id: n.into(),
            key: [n; 16],
            balance,
        };
        let accts = [acct(1, 100), acct(2, 100), acct(3, 0)];
        // Account 3 withdraws twice: the second no longer fits; 9 has no row; 0 is unused.
        let ws = [w(1, 100), w(2, 151), w(3, 6), w(3, 6), w(9, 1), w(1, 0)];
        let (after, ok) = apply_flows(&accts, &[0, 50, 10], &ws);
        assert_eq!(ok, vec![true, false, true, false, false, false]);
        let b: Vec<u64> = after.iter().map(|a| a.balance).collect();
        assert_eq!(b, vec![0, 150, 4], "a refused withdrawal leaves the credit");
    }

    #[test]
    fn winners_get_one_unit_per_contract_in_their_market_only() {
        let mut other = o(Side::Yes, 60, 1);
        other.market = 8;
        let batch = [o(Side::Yes, 60, 3), o(Side::No, 45, 2), other];
        let records = fill_records(&batch, &clear(&batch[..2]));
        let positions: Vec<_> = batch.iter().copied().zip(records.iter().copied()).collect();
        let accts = [Account {
            id: 42,
            key: [42; 16],
            balance: 7,
        }];
        // YES filled 2 of 3: two units. The unfilled remainder and market 8 pay nothing.
        assert_eq!(resolve(7, Side::Yes, &positions, &accts), vec![7 + 400]);
        assert_eq!(resolve(7, Side::No, &positions, &accts), vec![7 + 400]);
        assert_eq!(resolve(9, Side::Yes, &positions, &accts), vec![7]);
    }
}
