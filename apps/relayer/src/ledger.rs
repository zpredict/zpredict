//! Money in and out of the escrow as this relayer sees it: deposits its own scanner
//! found, withdrawal requests and their payouts, and markets already paid out.
//!
//! Every relayer keeps its own ledger. A deposit is credited only once all three
//! scanned it, and a withdrawal enters a batch only once all three received it
//! (`batch/hello.rs`), so no single relayer can invent either.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

/// Half-ticks kept from every withdrawal toward the payout's ZIP 317 fee (10,000 zats).
/// The escrow pays the fee; a batched payout costs 5,000 zats per logical action.
pub const WITHDRAWAL_FEE: u64 = 2;
/// Zatoshis per half-tick: 1 unit = 200 half-ticks = `zpredict_settle::UNIT_ZATS`.
pub const ZATS_PER_HALF_TICK: u64 = zpredict_settle::UNIT_ZATS / 200;

pub struct Deposit {
    pub account: u64,
    pub amount: u64,
    pub applied: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WithdrawalStatus {
    /// Waiting for a batch (all three relayers must hold the request).
    Pending,
    /// The account's row did not cover it; nothing was debited.
    Refused,
    /// Debited in a batch; the payout transaction is next.
    Debited,
    /// Relayer 0 is broadcasting the payout. Not retried automatically: a crash here
    /// needs an operator to check the chain before anything is paid twice.
    Paying,
    Paid,
}

pub struct Withdrawal {
    /// This relayer's XOR share of the account key.
    pub share: zpredict_core::Key,
    pub amount: u64,
    pub address: String,
    pub status: WithdrawalStatus,
    pub txid: Option<String>,
}

impl Withdrawal {
    /// What the payout sends: the amount less [`WITHDRAWAL_FEE`], in zatoshis.
    pub fn zats(&self) -> u64 {
        self.amount.saturating_sub(WITHDRAWAL_FEE) * ZATS_PER_HALF_TICK
    }
}

#[derive(Default)]
pub struct Ledger {
    /// Last escrow block this relayer's scanner has read.
    pub scanned: u32,
    deposits: BTreeMap<String, Deposit>,
    withdrawals: BTreeMap<String, Withdrawal>,
    /// Markets whose winners have been paid into the balance table.
    pub resolved: BTreeSet<u32>,
}

impl Ledger {
    pub fn deposit(&mut self, note: String, account: u64, amount: u64) {
        self.deposits.entry(note).or_insert(Deposit {
            account,
            amount,
            applied: false,
        });
    }

    /// Unapplied deposits as `note:account:amount`, sorted: what this relayer offers in
    /// a batch hello. Only deposits all three offer get credited.
    pub fn offered_deposits(&self) -> Vec<String> {
        let mut out: Vec<String> = (self.deposits.iter())
            .filter(|(_, d)| !d.applied)
            .map(|(n, d)| format!("{n}:{}:{}", d.account, d.amount))
            .collect();
        out.sort(); // the hello intersects by binary search
        out
    }

    pub fn apply_deposits(&mut self, offered: &[String]) {
        for key in offered {
            let note = key.split(':').next().unwrap_or_default();
            if let Some(d) = self.deposits.get_mut(note) {
                d.applied = true;
            }
        }
    }

    /// Records a request; false if the id is taken.
    pub fn request(
        &mut self,
        id: String,
        share: zpredict_core::Key,
        amount: u64,
        address: String,
    ) -> bool {
        if self.withdrawals.contains_key(&id) {
            return false;
        }
        let status = WithdrawalStatus::Pending;
        let w = Withdrawal {
            share,
            amount,
            address,
            status,
            txid: None,
        };
        self.withdrawals.insert(id, w);
        true
    }

    /// Pending requests as `id:amount:address`, sorted: what this relayer offers in a
    /// batch hello. Address and amount must match across relayers too.
    pub fn offered_withdrawals(&self) -> Vec<String> {
        let mut out: Vec<String> = (self.withdrawals.iter())
            .filter(|(_, w)| w.status == WithdrawalStatus::Pending)
            .map(|(id, w)| format!("{id}:{}:{}", w.amount, w.address))
            .collect();
        out.sort(); // the hello intersects by binary search
        out
    }

    pub fn withdrawal(&self, id: &str) -> Option<&Withdrawal> {
        self.withdrawals.get(id)
    }

    /// Debited requests not yet paid, sorted by id: the next payout vector.
    pub fn debited(&self) -> Vec<(&String, &Withdrawal)> {
        (self.withdrawals.iter())
            .filter(|(_, w)| w.status == WithdrawalStatus::Debited)
            .collect()
    }

    pub fn set(&mut self, id: &str, status: WithdrawalStatus, txid: Option<&str>) {
        if let Some(w) = self.withdrawals.get_mut(id) {
            w.status = status;
            w.txid = txid.map(str::to_owned).or(w.txid.take());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deposits_and_withdrawals_move_through_their_states() {
        let mut l = Ledger::default();
        l.deposit("aa-0".into(), 7, 1000);
        l.deposit("aa-0".into(), 9, 1); // a rescan never changes a deposit
        assert_eq!(l.offered_deposits(), vec!["aa-0:7:1000"]);
        l.apply_deposits(&["aa-0:7:1000".into()]);
        assert!(l.offered_deposits().is_empty());

        assert!(l.request("w1".into(), [1; 16], 202, "ua".into()));
        assert!(!l.request("w1".into(), [2; 16], 1, "x".into()));
        assert_eq!(l.offered_withdrawals(), vec!["w1:202:ua"]);
        assert_eq!(l.withdrawal("w1").unwrap().zats(), 200 * ZATS_PER_HALF_TICK);
        l.set("w1", WithdrawalStatus::Debited, None);
        assert_eq!(l.debited().len(), 1);
        l.set("w1", WithdrawalStatus::Paid, Some("tx"));
        assert!(l.debited().is_empty() && l.offered_withdrawals().is_empty());
        assert_eq!(l.withdrawal("w1").unwrap().txid.as_deref(), Some("tx"));
    }
}
