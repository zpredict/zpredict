//! The batch loop. Every window, all three relayers:
//! 1. connect over Noise ([`crate::peers`]) and swap a [`hello::Hello`]: pending orderIds,
//!    unapplied deposits from their own escrow scan, withdrawal requests, markets their
//!    own node resolved, and from relayer 0 the table row ids, open markets and judge
//!    credits. Only what all three offer counts ([`hello::exchange`]);
//! 2. relayers 1 and 2 append zero-share rows for table rows relayer 0 added;
//! 3. if a market resolved on all three nodes alike, pay its winners into the table
//!    (`resolution.rs`) and stop there for this window;
//! 4. otherwise clear: orders (capped at N), credits (agreed deposits, plus judge credits
//!    where judge mode is on), withdrawal slots, all padded with zero shares; one matcher
//!    run per group of open markets (`clear.rs`). A window with only credits or
//!    withdrawals still runs;
//! 5. store fill shares, new balance shares, prices and withdrawal results in one event,
//!    and expire orders that never reached all three relayers (`unfilled`);
//! 6. with settlement on, pay debited withdrawals out of the escrow ([`crate::escrow`]);
//! 7. if no preprocessed clearing run is held, preprocess the next one now (#94).
//!
//! **Preprocessing ahead.** About 92% of a clearing run is polytune's preprocessing,
//! which needs no inputs. So the relayers keep one preprocessed run ready, and a window
//! with work only runs the online part (inputs, evaluation, output): an order fills
//! about one online phase after the next window starts, instead of a whole run later.
//! The batch's contents are still fixed by the same hello, and the MPC computes and
//! reveals exactly what it did before. The held run is used only if the hello shows all
//! three hold the same one (its id is the batch number it was made in); otherwise each
//! drops its own and the batch preprocesses inline, as before. Idle windows cost a hello.
//!
//! A failed or aborted batch changes no shares: its orders stay pending and the next
//! window re-runs it.

mod clear;
mod hello;
mod resolution;
mod rows;

use std::sync::atomic::AtomicUsize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tokio::time::{Instant, sleep, timeout};
use zpredict_circuit::{DEFAULT_WITHDRAWALS, Public, Shares};
use zpredict_core::{KEY_LEN, ORDER_LEN};
use zpredict_oracle::Status;
use zpredict_settle::KeyShare;

use crate::error::{Error, Result};
use crate::escrow::Escrow;
use crate::mpc::Matcher;
use crate::peers::Peering;
use crate::state::Shared;
use crate::store::Event;
use hello::Hello;

pub struct Batcher<M: Matcher> {
    pub state: Shared,
    pub peering: Arc<Peering>,
    pub matcher: M,
    /// Order slots per batch (N).
    pub slots: usize,
    /// Balance-table rows per batch.
    // ponytail: rows past this cap wait (their orders become dummies); #48 grows the table.
    pub rows: usize,
    pub window: Duration,
    pub expire: u64,
    /// This relayer's FROST share for outcome signing (`outcome.rs`); `None` = unsigned.
    pub frost: Option<Arc<KeyShare>>,
    /// Accept relayer 0's judge-mode credits (they can't be checked against a scan).
    pub judge: bool,
    /// Escrow keys and tools; `None` leaves deposits to judge mode and pays nothing out.
    pub escrow: Option<Arc<Escrow>>,
    /// The preprocessed clearing run this relayer holds, with its id (see the module docs).
    pub pre: Mutex<Option<(u64, M::Pre)>>,
    /// Relayer 0: table rows in use at the last log line.
    pub logged_rows: AtomicUsize,
}

/// Runs forever. The matcher's futures need not be `Send`, so call this through
/// `Handle::block_on` on a blocking thread.
pub async fn run<M: Matcher>(b: Batcher<M>) {
    loop {
        sleep(until_next_window(b.window)).await;
        // Generous: a batch takes seconds; a payout adds proving and a broadcast.
        let budget = (b.window * 4).max(Duration::from_secs(180));
        match timeout(budget, b.once()).await {
            Ok(Ok(_)) => {}
            // Errors name no order, share or address: only what failed.
            Ok(Err(e)) => eprintln!("batch: {e}; retrying next window"),
            Err(_) => eprintln!("batch: timed out; retrying next window"),
        }
    }
}

fn until_next_window(window: Duration) -> Duration {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let w = window.as_millis().max(1);
    Duration::from_millis((w - now.as_millis() % w) as u64)
}

impl<M: Matcher> Batcher<M> {
    /// One batch attempt; returns the orderIds it cleared.
    pub async fn once(&self) -> Result<Vec<String>> {
        let deadline = Instant::now() + (self.window / 2).max(Duration::from_secs(2));
        let (links, up) = self.peering.connect(deadline).await;
        self.state.lock().expect("state lock").peers = up;
        let links = links?;
        crate::outcome::round(&links, &self.state, self.frost.as_deref()).await?;

        let mine = {
            let s = self.state.lock().expect("state lock");
            let open = s.markets.iter().filter(|m| m.status == Status::Open);
            Hello {
                batch: s.batch,
                pending: s.pending(),
                rows: s.table.ids(),
                markets: open.map(|m| m.id).collect(),
                credits: s.table.credits(self.rows, self.rows),
                deposits: s.ledger.offered_deposits(),
                withdrawals: s.ledger.offered_withdrawals(),
                resolved: s.unpaid_resolutions(),
                pre: self
                    .pre
                    .lock()
                    .expect("pre lock")
                    .as_ref()
                    .map(|(id, _)| *id),
            }
        };
        let a = hello::exchange(&links, mine).await?;
        let n = a.lead.rows.len().min(self.rows);
        self.log_rows(links.party, a.lead.rows.len());
        if links.party != 0 {
            let mut s = self.state.lock().expect("state lock");
            let missing = s.table.missing(&a.lead.rows)?;
            if !missing.is_empty() {
                s.record(Event::Rows { ids: missing })?;
            }
        }
        if let Some(&(market, outcome)) = a.resolved.iter().min() {
            self.resolve(&links, market, outcome, n).await?;
            return Ok(Vec::new());
        }

        let ids: Vec<String> = a.pending.iter().take(self.slots).cloned().collect();
        let (credits, deposits) = self.credits(&a, n)?;
        let slots: Vec<(&str, u64)> = (a.withdrawals.iter())
            .filter_map(|w| hello::withdrawal(w))
            .take(DEFAULT_WITHDRAWALS)
            .collect();
        let run = !ids.is_empty() || credits.iter().any(|&c| c > 0) || !slots.is_empty();
        // Only a run all three hold is usable; anything else is dropped here.
        let held = self.pre.lock().expect("pre lock").take();
        let mut pre = held.filter(|(id, _)| a.pre == Some(*id));
        if !run {
            *self.pre.lock().expect("pre lock") = pre.take();
        }
        let (expired, orders, accounts, keys, withdrawal_shares) = {
            let mut s = self.state.lock().expect("state lock");
            if links.party == 0 && run {
                s.record(Event::Seal { rows: n })?;
            }
            let mut orders = vec![[0u8; ORDER_LEN]; self.slots];
            for (slot, id) in orders.iter_mut().zip(&ids) {
                let o = s
                    .order(id)
                    .ok_or_else(|| Error::Peer("order vanished".into()))?;
                *slot = o.share;
            }
            let mut shares = vec![[0u8; KEY_LEN]; DEFAULT_WITHDRAWALS];
            for (slot, (id, _)) in shares.iter_mut().zip(&slots) {
                let w = (s.ledger.withdrawal(id))
                    .ok_or_else(|| Error::Peer("withdrawal vanished".into()))?;
                *slot = w.share;
            }
            let expired = s.expirable(a.batch, self.expire, &a.pending);
            let table = s.table.shares(n, self.rows);
            (
                expired,
                orders,
                table,
                s.table.key_shares(n, self.rows),
                shares,
            )
        };

        let mut withdrawals = vec![0u64; DEFAULT_WITHDRAWALS];
        (withdrawals.iter_mut().zip(&slots)).for_each(|(w, (_, amount))| *w = *amount);
        let first = Public {
            markets: vec![],
            credits: credits.clone(),
            withdrawals,
        };
        let shares = Shares {
            orders: &orders,
            accounts: &accounts,
            keys: &keys,
            withdrawals: &withdrawal_shares,
        };
        let done = if run {
            let pre = pre.map(|(_, p)| p);
            self.clear(&links, &a.lead.markets, first, shares, pre)
                .await?
        } else {
            Default::default()
        };
        {
            let mut s = self.state.lock().expect("state lock");
            if !run && expired.is_empty() {
                s.batch = a.batch + 1;
            } else {
                let results = slots.iter().zip(&done.withdrawn);
                s.record(Event::Batch {
                    batch: a.batch,
                    ids: ids.clone(),
                    fills: done.fills.iter().take(ids.len()).map(hex::encode).collect(),
                    balances: done.balances.iter().take(n).map(hex::encode).collect(),
                    prices: done.prices,
                    expired,
                    credits: if run { credits } else { Vec::new() },
                    deposits: if run { deposits } else { Vec::new() },
                    withdrawals: results.map(|((id, _), ok)| (id.to_string(), *ok)).collect(),
                })?;
            }
        }
        if let Some(escrow) = &self.escrow {
            crate::escrow::payout::round(escrow, &self.state, &links).await?;
        }
        if self.pre.lock().expect("pre lock").is_none() {
            let pre = self
                .matcher
                .preprocess(&links, self.slots, self.rows)
                .await?;
            *self.pre.lock().expect("pre lock") = Some((a.batch, pre));
        }
        Ok(ids)
    }
}
