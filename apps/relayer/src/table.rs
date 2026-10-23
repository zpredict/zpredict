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
//! that the shares are random, so relayer 0 queues the top-up as a *pending credit* for
//! the row; the next batch passes it to the circuit as a public input, which adds it
//! inside the MPC (#57). Every relayer sees deposit amounts anyway.
//!
//! Each relayer also keeps its own share of every account's key (the credential, from
//! its deposit-memo slot or a judge claim). The circuit lets an order or withdrawal use a
//! row only if it carries the key the three shares rebuild, so the row id is just a label.
//! Honest shares are deterministic per account, so a second, different share for a known
//! id means someone (another relayer) tried to choose this relayer's share: the key is
//! *burned* here, every batch gets a fresh random share for it, and nobody can use the
//! row again. That loses the row (denial of service) instead of handing it over.

use std::collections::{HashMap, HashSet};

use zpredict_core::{ACCOUNT_LEN, Account, BALANCE_LEN, KEY_LEN, Key};

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
    /// Relayer 0: half-ticks waiting to be credited to each sealed row by the circuit.
    pending: Vec<u64>,
    /// This relayer's key share per account id; `None` = burned (two different shares).
    keys: HashMap<u64, Option<Key>>,
    /// Ids opened by a judge claim (mock credit): never withdrawable on chain (#104).
    mock: HashSet<u64>,
}

impl Table {
    /// Records this relayer's key share for account `id`: the first one sticks, the same
    /// one again is a no-op, a different one burns the key. False if burned.
    pub fn register(&mut self, id: u64, share: Key) -> bool {
        let k = self.keys.entry(id).or_insert(Some(share));
        if *k != Some(share) {
            *k = None;
        }
        k.is_some()
    }

    /// Whether `share` is this relayer's (unburned) key share for `id`.
    pub fn key_matches(&self, id: u64, share: &Key) -> bool {
        self.keys.get(&id) == Some(&Some(*share))
    }

    /// Marks `id` as a judge-mode account: the circuit refuses its withdrawals.
    pub fn mark_mock(&mut self, id: u64) {
        self.mock.insert(id);
    }

    pub fn is_mock(&self, id: u64) -> bool {
        self.mock.contains(&id)
    }

    /// Whether each of the first `n` rows is a judge-mode account, padded with `false`.
    pub fn mock_flags(&self, n: usize, len: usize) -> Vec<bool> {
        let mut out: Vec<bool> = self
            .rows
            .iter()
            .take(n)
            .map(|r| self.is_mock(r.id))
            .collect();
        out.resize(len.max(out.len()), false);
        out
    }

    pub fn has_key(&self, id: u64) -> bool {
        self.keys.contains_key(&id)
    }

    /// Key shares of the first `n` rows, padded with zero to `len`. Rows without a usable
    /// share here (burned, or never registered at this relayer) get a fresh random one,
    /// so their key is unknown to everyone.
    pub fn key_shares(&self, n: usize, len: usize) -> Vec<Key> {
        let mut out: Vec<Key> = (self.rows.iter().take(n))
            .map(|r| match self.keys.get(&r.id) {
                Some(Some(k)) => *k,
                _ => {
                    let mut k = [0u8; KEY_LEN];
                    getrandom::fill(&mut k).expect("os rng");
                    k
                }
            })
            .collect();
        out.resize(len.max(out.len()), [0; KEY_LEN]);
        out
    }

    /// Relayer 0 only: credit `amount` half-ticks to account `id`.
    pub fn credit(&mut self, id: u64, amount: u64) {
        if let Some(k) = self.rows.iter().position(|r| r.id == id) {
            let r = &mut self.rows[k];
            if r.fresh {
                let bal = u64::from_le_bytes(r.share[8..].try_into().expect("8 bytes"));
                r.share[8..].copy_from_slice(&bal.saturating_add(amount).to_le_bytes());
            } else {
                self.pending.resize(self.rows.len(), 0);
                self.pending[k] = self.pending[k].saturating_add(amount);
            }
            return;
        }
        let share = Account {
            id,
            key: [0; KEY_LEN],
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

    /// Relayer 0: pending credits of the first `n` rows, padded with zeros to `len`.
    pub fn credits(&self, n: usize, len: usize) -> Vec<u64> {
        let mut out: Vec<u64> = self.pending.iter().take(n).copied().collect();
        out.resize(len.max(out.len()), 0);
        out
    }

    /// A batch applied `credits` (row by row): they are no longer pending.
    pub fn applied(&mut self, credits: &[u64]) {
        for (p, c) in self.pending.iter_mut().zip(credits) {
            *p = p.saturating_sub(*c);
        }
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

    /// The balance share of the account's row. Unknown accounts hold a zero share.
    /// Pending credits show up once the next batch applies them.
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
    fn fresh_rows_take_credits_then_top_ups_wait_for_the_circuit() {
        let mut t = Table::default();
        t.credit(7, 100);
        t.credit(7, 50);
        assert_eq!(t.balance_share(7), 150u64.to_le_bytes());
        t.seal(1);
        t.credit(7, 25);
        t.credit(7, 5);
        assert_eq!(t.ids(), vec![7], "no duplicate row");
        assert_eq!(t.balance_share(7), 150u64.to_le_bytes());
        assert_eq!(t.credits(1, 3), vec![30, 0, 0]);
        t.applied(&[30, 0, 0]);
        assert_eq!(t.credits(1, 1), vec![0]);
        assert_eq!(
            t.shares(1, 3)[0],
            Account {
                id: 7,
                key: [0; KEY_LEN],
                balance: 150
            }
            .encode()
        );
        assert_eq!(t.shares(1, 3)[2], [0; ACCOUNT_LEN]);
    }

    #[test]
    fn a_second_different_key_share_burns_the_key() {
        let mut t = Table::default();
        t.credit(7, 1);
        t.credit(8, 1);
        assert!(t.register(7, [1; KEY_LEN]));
        assert!(t.register(7, [1; KEY_LEN]), "the same share again is fine");
        assert!(t.key_matches(7, &[1; KEY_LEN]));
        assert_eq!(
            t.key_shares(1, 3),
            vec![[1; KEY_LEN], [0; KEY_LEN], [0; KEY_LEN]]
        );
        assert!(!t.register(7, [2; KEY_LEN]));
        assert!(!t.register(7, [1; KEY_LEN]), "burned for good");
        assert!(!t.key_matches(7, &[1; KEY_LEN]) && t.has_key(7));
        let (a, b) = (t.key_shares(2, 2), t.key_shares(2, 2));
        assert_ne!(a[0], [1; KEY_LEN]);
        assert_ne!(a[0], b[0], "burned and unknown keys are fresh randomness");
        assert_ne!(a[1], b[1]);
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
