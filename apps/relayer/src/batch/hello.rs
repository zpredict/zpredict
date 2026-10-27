//! The batch handshake: every relayer offers what it holds, and only what all three
//! offer goes into the batch. That is what keeps a single relayer from inventing an
//! order, a deposit or a withdrawal, or from naming a resolution its peers' nodes
//! did not see.

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::peers::Links;

#[derive(Default, Serialize, Deserialize)]
pub struct Hello {
    pub batch: u64,
    /// `State::commits`: the three must match, or the balance shares have diverged (#188).
    #[serde(default)]
    pub commits: u64,
    /// Pending orderIds, sorted.
    pub pending: Vec<String>,
    /// Relayer 0 only: table row ids in order, open market ids, and judge-mode credits
    /// per row (half-ticks), which only relayer 0 can see.
    pub rows: Vec<u64>,
    pub markets: Vec<u32>,
    #[serde(default)]
    pub credits: Vec<u64>,
    /// Confirmed deposits this relayer's scanner found, not yet credited
    /// (`note:account:amount`, sorted).
    #[serde(default)]
    pub deposits: Vec<String>,
    /// Withdrawal requests this relayer holds, not yet in a batch
    /// (`id:amount:address`, sorted).
    #[serde(default)]
    pub withdrawals: Vec<String>,
    /// Markets this relayer's node resolved and whose winners are unpaid, with the
    /// outcome (0 = YES, 1 = NO).
    #[serde(default)]
    pub resolved: Vec<(u32, u8)>,
    /// Id of the clearing run this relayer has preprocessed and holds (`mod.rs`).
    #[serde(default)]
    pub pre: Option<u64>,
    /// Relayer 0 only: run the escrow payout round this window (debited withdrawals and
    /// no backoff after a failed round, #104). Its peers follow it.
    #[serde(default)]
    pub payout: bool,
}

/// What all three relayers offered, and relayer 0's hello.
pub struct Agreed {
    /// The max batch number of the three, so counters stay in sync.
    pub batch: u64,
    /// Pending orders all three hold, sorted (not yet capped at N).
    pub pending: Vec<String>,
    pub deposits: Vec<String>,
    pub withdrawals: Vec<String>,
    pub resolved: Vec<(u32, u8)>,
    /// The preprocessed run all three hold, if they hold the same one.
    pub pre: Option<u64>,
    pub lead: Hello,
}

/// Sends `mine` to both peers and intersects with theirs.
pub async fn exchange(links: &Links, mine: Hello) -> Result<Agreed> {
    let bytes = serde_json::to_vec(&mine)?;
    let others = || (0..3).filter(|&p| p != links.party);
    for p in others() {
        links.send(p, &bytes).await?;
    }
    let mut a = Agreed {
        batch: mine.batch,
        pending: mine.pending.clone(),
        deposits: mine.deposits.clone(),
        withdrawals: mine.withdrawals.clone(),
        resolved: mine.resolved.clone(),
        pre: mine.pre,
        lead: Hello::default(),
    };
    let mut lead = None;
    let mut markets = mine.markets.clone();
    for p in others() {
        let h: Hello = serde_json::from_slice(&links.recv(p).await?)?;
        // A relayer that missed a commit holds shares from another run: clearing or paying
        // on them would combine to garbage balances, so stop until an operator restores.
        if h.commits != mine.commits {
            return Err(Error::Peer(format!(
                "diverged: relayer {p} recorded {} runs, this one {}",
                h.commits, mine.commits
            )));
        }
        a.batch = a.batch.max(h.batch);
        // All three lists are sorted (BTreeMap order or sorted ids).
        a.pending.retain(|x| h.pending.binary_search(x).is_ok());
        a.deposits.retain(|x| h.deposits.binary_search(x).is_ok());
        a.withdrawals
            .retain(|x| h.withdrawals.binary_search(x).is_ok());
        a.resolved.retain(|x| h.resolved.contains(x));
        a.pre = a.pre.filter(|&id| h.pre == Some(id));
        markets.retain(|m| h.markets.contains(m));
        if p == 0 {
            lead = Some(h);
        }
    }
    a.lead = lead.unwrap_or(mine);
    // Trade only markets open at all three: one whose node missed a market (a rolling
    // window, a lagging oracle) could never resolve it with the others, so fills there
    // would never be paid. Relayer 0's order is kept, so all three use the same slots.
    a.lead.markets.retain(|m| markets.contains(m));
    Ok(a)
}

/// `(account, amount)` of an offered deposit (`note:account:amount`).
pub fn deposit(key: &str) -> Option<(u64, u64)> {
    let mut parts = key.split(':').skip(1);
    Some((parts.next()?.parse().ok()?, parts.next()?.parse().ok()?))
}

/// `(id, amount)` of an offered withdrawal (`id:amount:address`).
pub fn withdrawal(key: &str) -> Option<(&str, u64)> {
    let mut parts = key.split(':');
    Some((parts.next()?, parts.next()?.parse().ok()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offered_keys_parse() {
        assert_eq!(deposit("ab-0:7:1000"), Some((7, 1000)));
        assert_eq!(deposit("ab-0:x:1"), None);
        assert_eq!(withdrawal("w1:202:uregtest1x"), Some(("w1", 202)));
    }
}
