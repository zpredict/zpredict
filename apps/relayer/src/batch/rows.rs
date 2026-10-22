//! The balance-table side of a batch: this window's credit per row, and the operator's
//! rows-used log line.

use std::sync::atomic::Ordering;

use super::Batcher;
use super::hello::{self, Agreed};
use crate::error::{Error, Result};
use crate::mpc::Matcher;

impl<M: Matcher> Batcher<M> {
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
