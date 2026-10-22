//! The batch loop. Every window, all three relayers:
//! 1. connect over Noise ([`crate::peers`]) and swap their pending orderId sets (orderIds
//!    are random and public); the batch is the sorted intersection, capped at N slots,
//!    and the batch number is the max of the three, so counters stay in sync;
//! 2. pad to N with all-zero shares (they rebuild to price 0, a dummy);
//! 3. run the [`Matcher`] as one MPC party;
//! 4. store this relayer's fill shares and the public clearing prices in one event;
//! 5. expire orders that never reached all three relayers (`unfilled`).
//!
//! A failed or aborted batch changes nothing: its orders stay pending and the next window
//! re-runs it.

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tokio::time::{Instant, sleep, timeout};
use zpredict_core::ORDER_LEN;

use crate::error::{Error, Result};
use crate::mpc::Matcher;
use crate::peers::{Links, Peering};
use crate::state::Shared;
use crate::store::Event;

pub struct Batcher<M> {
    pub state: Shared,
    pub peering: Arc<Peering>,
    pub matcher: M,
    pub slots: usize,
    pub window: Duration,
    pub expire: u64,
}

#[derive(Serialize, Deserialize)]
struct Hello {
    batch: u64,
    pending: Vec<String>,
}

/// Runs forever. The matcher's futures need not be `Send`, so call this through
/// `Handle::block_on` on a blocking thread.
pub async fn run<M: Matcher>(b: Batcher<M>) {
    loop {
        sleep(until_next_window(b.window)).await;
        // Generous: N = 16 takes ~8 s in release on one machine, longer between hosts.
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

        let (mut batch, mut common) = {
            let s = self.state.lock().expect("state lock");
            (s.batch, s.pending())
        };
        let hello = serde_json::to_vec(&Hello {
            batch,
            pending: common.clone(),
        })?;
        let others = || (0..3).filter(|&p| p != links.party);
        for p in others() {
            links.send(p, &hello).await?;
        }
        for p in others() {
            let h: Hello = serde_json::from_slice(&links.recv(p).await?)?;
            batch = batch.max(h.batch);
            common.retain(|id| h.pending.binary_search(id).is_ok());
        }
        let ids: Vec<String> = common.iter().take(self.slots).cloned().collect();
        let expired =
            (self.state.lock().expect("state lock")).expirable(batch, self.expire, &common);

        let cleared = if ids.is_empty() {
            Default::default()
        } else {
            self.clear(&links, &ids).await?
        };
        let mut s = self.state.lock().expect("state lock");
        if ids.is_empty() && expired.is_empty() {
            s.batch = batch + 1;
            return Ok(ids);
        }
        s.record(Event::Batch {
            batch,
            ids: ids.clone(),
            fills: cleared
                .fills
                .iter()
                .take(ids.len())
                .map(hex::encode)
                .collect(),
            prices: cleared.prices,
            expired,
        })?;
        Ok(ids)
    }

    async fn clear(&self, links: &Links, ids: &[String]) -> Result<crate::mpc::Cleared> {
        let mut shares = vec![[0u8; ORDER_LEN]; self.slots];
        {
            let s = self.state.lock().expect("state lock");
            for (slot, id) in shares.iter_mut().zip(ids) {
                *slot = s
                    .order(id)
                    .ok_or_else(|| Error::Peer("order vanished".into()))?
                    .share;
            }
        }
        let cleared = self.matcher.clear(links, &shares).await?;
        if cleared.fills.len() < ids.len() {
            return Err(Error::Mpc("matcher returned too few fill shares".into()));
        }
        Ok(cleared)
    }
}
