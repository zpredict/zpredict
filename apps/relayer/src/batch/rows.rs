//! The balance-table side of a batch: this window's credit per row, and the operator's
//! rows-used log line.

use std::sync::atomic::Ordering;

use super::Batcher;
use super::hello::{self, Agreed};
use crate::error::{Error, Result};
use crate::mpc::Matcher;

/// Payout backoff after a failed round, in batches (5 s windows): 1 min doubling to 1 h.
const BACKOFF: (u64, u64) = (12, 720);

impl<M: Matcher> Batcher<M> {
    /// The escrow payout round, which never fails the batch: clearing and preprocessing
    /// go on whatever the escrow holds (#104). A failure is logged, shown on debited
    /// withdrawals, and retried after a backoff that relayer 0 announces in its hello.
    /// Returns whether the round succeeded.
    pub(super) async fn payout(
        &self,
        escrow: &crate::escrow::Escrow,
        links: &crate::peers::Links,
        batch: u64,
    ) -> bool {
        let result = crate::escrow::payout::round(escrow, &self.state, links).await;
        self.state.lock().expect("state lock").payout_retrying = result.is_err();
        let mut b = self.payout_backoff.lock().expect("backoff lock");
        match result {
            Ok(()) => {
                *b = (0, 0);
                true
            }
            Err(e) => {
                let delay = (b.1 * 2).clamp(BACKOFF.0, BACKOFF.1);
                *b = (batch + delay, delay);
                eprintln!("payout: {e}; retrying in {delay} batches");
                false
            }
        }
    }

    /// Relayer 0, to the operator's log only (never served): rows used whenever it
    /// changes. Accounts past `rows` can't trade until a row frees (#99, #64).
    pub(super) fn log_rows(&self, party: usize, used: usize) {
        if party != 0 || self.logged_rows.swap(used, Ordering::Relaxed) == used {
            return;
        }
        let waiting = used.saturating_sub(self.rows);
        eprintln!(
            "table: {} of {} rows used, {waiting} accounts waiting",
            used.min(self.rows),
            self.rows
        );
    }

    /// This batch's credit per row: relayer 0's judge credits (only where this relayer
    /// runs judge mode too) plus every deposit all three scanned whose account has one
    /// of the first `n` rows. Returns the credits and the deposits they include.
    pub(super) fn credits(&self, a: &Agreed, n: usize) -> Result<(Vec<u64>, Vec<String>)> {
        let mut credits = vec![0u64; self.rows];
        if a.lead.credits.iter().any(|&c| c > 0) {
            if !self.judge {
                return Err(Error::Peer(
                    "relayer 0 announced credits no scan backs".into(),
                ));
            }
            // Rows past `n` sit out this batch, so their credits wait too.
            for (c, l) in credits.iter_mut().zip(&a.lead.credits).take(n) {
                *c = *l;
            }
        }
        let mut applied = Vec::new();
        for key in &a.deposits {
            let Some((account, amount)) = hello::deposit(key) else {
                continue;
            };
            if let Some(r) = a.lead.rows[..n].iter().position(|&id| id == account) {
                credits[r] += amount;
                applied.push(key.clone());
            }
        }
        Ok((credits, applied))
    }
}
