//! Money in and out of the balance table, outside order matching: deposits and
//! withdrawals before a batch clears ([`apply_flows`]), and winners' payouts once a
//! market resolves ([`resolve`]). The circuits mirror both.

use crate::balance::Account;
use crate::order::{Order, Side};
use crate::{FILL_LEN, HALF_TICKS_PER_UNIT};

/// Adds `credits[r]` to row `r`, then takes `debits[r]` (a withdrawal) only if the row
/// can cover it. Returns the new table and, per row, whether its withdrawal went through.
/// Both vectors are public: every relayer sees deposit amounts and must know withdrawal
/// amounts to pay them out, so they reveal nothing new; `withdrawn` tells them only that
/// the account held at least the amount.
pub fn apply_flows(
    accounts: &[Account],
    credits: &[u64],
    debits: &[u64],
) -> (Vec<Account>, Vec<bool>) {
    accounts
        .iter()
        .zip(credits)
        .zip(debits)
        .map(|((a, &c), &d)| {
            let balance = a.balance + c;
            let ok = d > 0 && balance >= d;
            let balance = if ok { balance - d } else { balance };
            (Account { balance, ..*a }, ok)
        })
        .unzip()
}

/// New balances once `market` resolves to `outcome`: every position (an order and its
/// combined fill record) that filled on the winning side in that market pays its size in
/// units (one unit per contract, 200 half-ticks) into the first row of its account.
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
        let row = accounts.iter().position(|a| a.id == o.account);
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
        let accts = [
            Account {
                id: 1,
                balance: 100,
            },
            Account {
                id: 2,
                balance: 100,
            },
            Account { id: 3, balance: 0 },
        ];
        let (after, ok) = apply_flows(&accts, &[0, 50, 10], &[100, 151, 0]);
        assert_eq!(ok, vec![true, false, false]);
        let b: Vec<u64> = after.iter().map(|a| a.balance).collect();
        assert_eq!(
            b,
            vec![0, 150, 10],
            "a refused withdrawal leaves the credit"
        );
    }

    #[test]
    fn winners_get_one_unit_per_contract_in_their_market_only() {
        let mut other = o(Side::Yes, 60, 1);
        other.market = 8;
        let batch = [o(Side::Yes, 60, 3), o(Side::No, 45, 2), other];
        let records = fill_records(&batch, &clear(&batch[..2]));
        let positions: Vec<_> = batch.iter().copied().zip(records.iter().copied()).collect();
        let accts = [Account { id: 42, balance: 7 }];
        // YES filled 2 of 3: two units. The unfilled remainder and market 8 pay nothing.
        assert_eq!(resolve(7, Side::Yes, &positions, &accts), vec![7 + 400]);
        assert_eq!(resolve(7, Side::No, &positions, &accts), vec![7 + 400]);
        assert_eq!(resolve(9, Side::Yes, &positions, &accts), vec![7]);
    }
}
