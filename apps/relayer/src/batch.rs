//! The batch loop. Every window, all three relayers:
//! 1. connect over Noise ([`crate::peers`]) and swap a [`Hello`]: pending orderIds
//!    (random and public), and from relayer 0 the balance-table row ids and the open
//!    markets. The batch is the sorted intersection of the pending sets, capped at N;
//!    the batch number is the max of the three, so counters stay in sync;
//! 2. relayers 1 and 2 append zero-share rows for table rows relayer 0 added, and all
//!    take relayer 0's pending credits (public deposit amounts per row);
//! 3. pad orders to N and the table to its row count with all-zero shares;
//! 4. run the [`Matcher`] as one MPC party: once per open market if it filters by market
//!    (fill shares XOR together, balances chain, credits go in the first run), else
//!    once. A window with credits but no orders still runs, so top-ups land;
//! 5. store fill shares, new balance shares and public prices in one event, and expire
//!    orders that never reached all three relayers (`unfilled`).
//!
//! A failed or aborted batch changes no shares: its orders stay pending and the next
//! window re-runs it.

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tokio::time::{Instant, sleep, timeout};
use zpredict_core::{ACCOUNT_LEN, FILL_LEN, ORDER_LEN};
use zpredict_oracle::Status;

use crate::error::{Error, Result};
use crate::mpc::{Cleared, Matcher};
use crate::peers::{Links, Peering};
use crate::state::Shared;
use crate::store::Event;

pub struct Batcher<M> {
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
}

#[derive(Serialize, Deserialize)]
struct Hello {
    batch: u64,
    pending: Vec<String>,
    /// Relayer 0 only: table row ids in order, open market ids, and pending credits
    /// per row (half-ticks).
    rows: Vec<u64>,
    markets: Vec<u32>,
    #[serde(default)]
    credits: Vec<u64>,
}

/// Runs forever. The matcher's futures need not be `Send`, so call this through
/// `Handle::block_on` on a blocking thread.
pub async fn run<M: Matcher>(b: Batcher<M>) {
    loop {
        sleep(until_next_window(b.window)).await;
        // Generous: N = 16 takes ~11 s in release on one machine, longer between hosts.
        let budget = (b.window * 4).max(Duration::from_secs(120));
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

        let mine = {
            let s = self.state.lock().expect("state lock");
            let open = s.markets.iter().filter(|m| m.status == Status::Open);
            Hello {
                batch: s.batch,
                pending: s.pending(),
                rows: s.table.ids(),
                markets: open.map(|m| m.id).collect(),
                credits: s.table.credits(self.rows, self.rows),
            }
        };
        let hello = serde_json::to_vec(&mine)?;
        let others = || (0..3).filter(|&p| p != links.party);
        for p in others() {
            links.send(p, &hello).await?;
        }
        let (mut batch, mut common, mut lead) = (mine.batch, mine.pending.clone(), None);
        for p in others() {
            let h: Hello = serde_json::from_slice(&links.recv(p).await?)?;
            batch = batch.max(h.batch);
            common.retain(|id| h.pending.binary_search(id).is_ok());
            if p == 0 {
                lead = Some(h);
            }
        }
        let lead = lead.unwrap_or(mine);
        let ids: Vec<String> = common.iter().take(self.slots).cloned().collect();
        let n = lead.rows.len().min(self.rows);
        // Rows past `n` sit out this batch, so their credits wait too.
        let mut credits = vec![0u64; self.rows];
        for (c, l) in credits.iter_mut().zip(&lead.credits).take(n) {
            *c = *l;
        }
        let run = !ids.is_empty() || credits.iter().any(|&c| c > 0);
        let (expired, orders, accounts) = {
            let mut s = self.state.lock().expect("state lock");
            if links.party != 0 {
                let missing = s.table.missing(&lead.rows)?;
                if !missing.is_empty() {
                    s.record(Event::Rows { ids: missing })?;
                }
            } else if run {
                s.record(Event::Seal { rows: n })?;
            }
            let mut orders = vec![[0u8; ORDER_LEN]; self.slots];
            for (slot, id) in orders.iter_mut().zip(&ids) {
                *slot = s
                    .order(id)
                    .ok_or_else(|| Error::Peer("order vanished".into()))?
                    .share;
            }
            let expired = s.expirable(batch, self.expire, &common);
            (expired, orders, s.table.shares(n, self.rows))
        };

        let (fills, balances, prices) = if run {
            self.clear(&links, &lead.markets, &credits, &orders, &accounts)
                .await?
        } else {
            Default::default()
        };
        let mut s = self.state.lock().expect("state lock");
        if !run && expired.is_empty() {
            s.batch = batch + 1;
            return Ok(ids);
        }
        s.record(Event::Batch {
            batch,
            ids: ids.clone(),
            fills: fills.iter().take(ids.len()).map(hex::encode).collect(),
            balances: balances.iter().take(n).map(hex::encode).collect(),
            prices,
            expired,
            credits: if run { credits } else { Vec::new() },
        })?;
        Ok(ids)
    }

    /// Runs the matcher once per open market (or once, if it ignores the market, or if
    /// no market is open and only credits are due). Credits go in the first run only.
    async fn clear(
        &self,
        links: &Links,
        markets: &[u32],
        credits: &[u64],
        orders: &[[u8; ORDER_LEN]],
        accounts: &[[u8; ACCOUNT_LEN]],
    ) -> Result<(Vec<[u8; FILL_LEN]>, Vec<[u8; 8]>, Vec<(u32, u16)>)> {
        let mut passes = if self.matcher.per_market() {
            markets.to_vec()
        } else {
            vec![0]
        };
        if passes.is_empty() {
            passes.push(0);
        }
        let zero = vec![0u64; credits.len()];
        let mut fills = vec![[0u8; FILL_LEN]; orders.len()];
        let mut table = accounts.to_vec();
        let mut prices = Vec::new();
        for (k, market) in passes.into_iter().enumerate() {
            let credits = if k == 0 { credits } else { &zero };
            let Cleared {
                fills: f,
                balances,
                price,
            } = (self.matcher)
                .clear(links, market, credits, orders, &table)
                .await?;
            if f.len() < orders.len() || balances.len() < table.len() {
                return Err(Error::Mpc("matcher returned too few shares".into()));
            }
            fills
                .iter_mut()
                .zip(f)
                .for_each(|(a, b)| a.iter_mut().zip(b).for_each(|(x, y)| *x ^= y));
            table
                .iter_mut()
                .zip(&balances)
                .for_each(|(row, b)| row[8..].copy_from_slice(b));
            prices.extend(price.map(|p| (market, p)));
        }
        let balances = table
            .iter()
            .map(|r| r[8..].try_into().expect("8 bytes"))
            .collect();
        Ok((fills, balances, prices))
    }
}
