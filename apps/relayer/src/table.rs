//! This relayer's shares of the balance table: rows of `id u64 | balance u64`
//! (`zpredict_core::Account::encode`), XOR-shared like orders.
//!
//! The whole table goes into every batch, so no relayer learns which accounts traded.
//! Relayer 0 owns the row order: it adds a row for a new account with the plain id and
//! amount as its share, `(row, 0, 0)`; relayers 1 and 2 append all-zero shares for the
//! rows relayer 0 announces at the start of each batch. Rows are only ever appended.
//!
//! A row is *fresh* until it first enters a batch. While fresh, its shares are still
//! `(row, 0, 0)`, so relayer 0 can credit it by adding to its own balance share. After
//! that the shares are random, so a top-up becomes a new fresh row with the same id.

use zpredict_core::{ACCOUNT_LEN, Account, BALANCE_LEN};

use crate::error::{Error, Result};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Row {
    pub id: u64,
    pub share: [u8; ACCOUNT_LEN],
    pub fresh: bool,
}

#[derive(Default)]
pub struct Table {
    rows: Vec<Row>,
}

impl Table {
    /// Relayer 0 only: credit `amount` half-ticks to account `id`.
    pub fn credit(&mut self, id: u64, amount: u64) {
        if let Some(r) = self.rows.iter_mut().rev().find(|r| r.id == id && r.fresh) {
            let bal = u64::from_le_bytes(r.share[8..].try_into().expect("8 bytes"));
            r.share[8..].copy_from_slice(&bal.saturating_add(amount).to_le_bytes());
            return;
        }
        let share = Account {
            id,
            balance: amount,
        }
        .encode();
        self.rows.push(Row {
            id,
            share,
            fresh: true,
        });
    }

    /// Relayers 1 and 2: the ids relayer 0 announced that this table lacks. Errors if
    /// this table is not a prefix of relayer 0's (it never should be).
    pub fn missing(&self, announced: &[u64]) -> Result<Vec<u64>> {
        let ours = self.rows.iter().map(|r| r.id);
        if announced.len() < self.rows.len()
            || !ours.eq(announced[..self.rows.len()].iter().copied())
        {
            return Err(Error::Peer(
                "balance table out of step with relayer 0".into(),
            ));
        }
        Ok(announced[self.rows.len()..].to_vec())
    }

    /// Relayers 1 and 2: append all-zero shares for rows relayer 0 created.
    pub fn append_zero(&mut self, ids: &[u64]) {
        let rows = ids.iter().map(|&id| Row {
            id,
            share: [0; ACCOUNT_LEN],
            fresh: false,
        });
        self.rows.extend(rows);
    }

    pub fn ids(&self) -> Vec<u64> {
        self.rows.iter().map(|r| r.id).collect()
    }

    /// The first `n` rows enter a batch: from now on they are credited via new rows.
    pub fn seal(&mut self, n: usize) {
        self.rows.iter_mut().take(n).for_each(|r| r.fresh = false);
    }

    /// Shares of the first `n` rows, padded with all-zero rows to `len`.
    pub fn shares(&self, n: usize, len: usize) -> Vec<[u8; ACCOUNT_LEN]> {
        let mut out: Vec<_> = self.rows.iter().take(n).map(|r| r.share).collect();
        out.resize(len.max(out.len()), [0; ACCOUNT_LEN]);
        out
    }

    /// A batch's new balance shares for its first rows (ids keep their shares).
    pub fn set_balances(&mut self, balances: &[[u8; BALANCE_LEN]]) {
        for (r, b) in self.rows.iter_mut().zip(balances) {
            r.share[8..].copy_from_slice(b);
            r.fresh = false;
        }
    }

    /// The balance share of the account's first row, the one orders spend from.
    /// Unknown accounts hold a zero share.
    // ponytail: top-up rows (same id, added after the first row was batched) are neither
    // spent nor shown until the circuit merges duplicate ids; see README "Known gaps".
    pub fn balance_share(&self, id: u64) -> [u8; BALANCE_LEN] {
        let row = self.rows.iter().find(|r| r.id == id);
        row.map_or([0; BALANCE_LEN], |r| {
            r.share[8..].try_into().expect("8 bytes")
        })
    }

    pub fn len(&self) -> usize {
        self.rows.len()
    }

    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_rows_take_credits_then_top_ups_get_new_rows() {
        let mut t = Table::default();
        t.credit(7, 100);
        t.credit(7, 50);
        assert_eq!(t.balance_share(7), 150u64.to_le_bytes());
        t.seal(1);
        t.credit(7, 25);
        assert_eq!(
            (t.ids(), t.balance_share(7)),
            (vec![7, 7], 150u64.to_le_bytes())
        );
        assert_eq!(
            t.shares(1, 3)[0],
            Account {
                id: 7,
                balance: 150
            }
            .encode()
        );
        assert_eq!(t.shares(1, 3)[2], [0; ACCOUNT_LEN]);
    }

    #[test]
    fn followers_append_zero_rows_and_detect_drift() {
        let mut t = Table::default();
        assert_eq!(t.missing(&[3, 4]).unwrap(), vec![3, 4]);
        t.append_zero(&[3, 4]);
        assert_eq!(t.missing(&[3, 4, 5]).unwrap(), vec![5]);
        assert!(t.missing(&[4, 3, 5]).is_err());
        assert!(t.missing(&[3]).is_err());
        assert_eq!(t.balance_share(3), [0; BALANCE_LEN]);
    }
}
