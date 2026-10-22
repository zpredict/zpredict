//! Rolling short-horizon markets: every `interval_secs` a new "Will mainnet block H contain
//! ≥ N shielded actions?" with H about `horizon_secs` ahead, so judges see a market open,
//! close, resolve and get signed within the hour.
//!
//! **Deterministic**, so the three relayers agree without talking: everything follows from
//! the chain. Time is nominal block time, 75 s per block below `fast_from` (NU7, mainnet
//! 3,543,405) and 25 s from there. Window `k` starts at the first height whose nominal time
//! reaches `k · interval_secs`: every 48 blocks before NU7 and every 144 after it at one
//! hour. Its market has id `ROLLING_ID_BASE + k`, H = the height at `k · interval +
//! horizon`, and closes at the height `close_secs` before H. N is the median
//! shielded-action count of the `sample_blocks` blocks ending `CONFIRMATIONS` below the
//! window start (blocks every relayer reads from its own node), so YES and NO are about
//! even.
//!
//! **Cap:** a market is only created while fewer than `DEFAULT_MARKETS` (4, the markets
//! one MPC run clears) close after its start height. With the three headline markets and
//! `horizon_secs = interval_secs`, that is one rolling market open at a time: 3 + 1 = 4.

use std::collections::HashSet;

use serde::Deserialize;
use serde_json::json;
use zpredict_oracle::{CONFIRMATIONS, Chain, Error, Market, Result, Status};

/// Rolling market ids are `ROLLING_ID_BASE + window`; config markets stay below it.
pub const ROLLING_ID_BASE: u32 = 1_000_000;
/// Nominal block spacing before and after `fast_from`, in seconds.
const SLOW: u64 = 75;
const FAST: u64 = 25;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Rolling {
    /// Resolver plugin; the generator only knows `shielded-actions`.
    pub plugin: String,
    /// A new market every this many seconds of nominal block time.
    pub interval_secs: u64,
    /// How far past the window start the market's block H is.
    pub horizon_secs: u64,
    /// Trading closes this long before H.
    pub close_secs: u64,
    /// Recent blocks whose median shielded-action count sets N.
    pub sample_blocks: u32,
    /// Resolved rolling markets kept as history; older ones are dropped.
    pub keep_resolved: usize,
    /// First height with 25 s blocks (NU7 activation).
    pub fast_from: u32,
}

impl Rolling {
    pub fn validate(&self) -> std::result::Result<(), String> {
        if self.plugin != "shielded-actions" {
            return Err("rolling.plugin must be shielded-actions".into());
        }
        if self.interval_secs == 0 || self.sample_blocks == 0 || self.close_secs == 0 {
            return Err("rolling interval_secs, close_secs, sample_blocks must be positive".into());
        }
        if self.horizon_secs <= self.close_secs {
            return Err("rolling.horizon_secs must exceed close_secs".into());
        }
        Ok(())
    }

    /// Nominal time of height `h`.
    fn secs(&self, h: u32) -> u64 {
        let slow = u64::from(h.min(self.fast_from));
        SLOW * slow + FAST * (u64::from(h) - slow)
    }

    /// The first height whose nominal time is at least `t`.
    fn height_at(&self, t: u64) -> u32 {
        let edge = SLOW * u64::from(self.fast_from);
        let h = if t <= edge {
            t.div_ceil(SLOW)
        } else {
            u64::from(self.fast_from) + (t - edge).div_ceil(FAST)
        };
        u32::try_from(h).expect("heights fit u32")
    }

    /// The market of the window `tip` is in, unless it exists already or the cap is full.
    /// Reads `sample_blocks` blocks from `chain` for N.
    pub fn due(&self, tip: u32, markets: &[Market], chain: &dyn Chain) -> Result<Option<Market>> {
        let k = self.secs(tip) / self.interval_secs;
        let id = u32::try_from(k)
            .ok()
            .and_then(|k| k.checked_add(ROLLING_ID_BASE))
            .ok_or_else(|| Error::BadReply("rolling window overflows a market id".into()))?;
        let t = k * self.interval_secs;
        let start = self.height_at(t);
        let resolve = self.height_at(t + self.horizon_secs);
        let close = self.height_at(t + self.horizon_secs - self.close_secs);
        let open = markets.iter().filter(|m| m.close_height > start).count();
        if markets.iter().any(|m| m.id == id) || open >= zpredict_circuit::DEFAULT_MARKETS {
            return Ok(None);
        }
        let n = self.median(start, chain)?.max(1);
        Ok(Some(Market {
            id,
            question: format!(
                "Will mainnet block {} contain ≥ {n} shielded actions?",
                thousands(resolve)
            ),
            plugin: self.plugin.clone(),
            params: json!({ "minActions": n }),
            close_height: close,
            resolve_height: resolve,
            status: Status::Open,
            outcome: None,
            outcome_sig: None,
            block_hash: None,
            block_height: None,
            rolling: true,
        }))
    }

    /// Upper median of the shielded-action counts just below `start`.
    fn median(&self, start: u32, chain: &dyn Chain) -> Result<u32> {
        let end = start.saturating_sub(CONFIRMATIONS);
        let mut counts = (end.saturating_sub(self.sample_blocks)..end)
            .map(|h| {
                let b = chain.block(h)?;
                b.map(|b| b.shielded_actions)
                    .ok_or_else(|| Error::BadReply(format!("no block {h} yet")))
            })
            .collect::<Result<Vec<_>>>()?;
        counts.sort_unstable();
        Ok(counts.get(counts.len() / 2).copied().unwrap_or(0))
    }

    /// Drops the oldest resolved rolling markets past `keep_resolved`.
    pub fn prune(&self, markets: &mut Vec<Market>) {
        let mut done: Vec<u32> = (markets.iter())
            .filter(|m| m.rolling && m.status == Status::Resolved)
            .map(|m| m.id)
            .collect();
        done.sort_unstable();
        let old: HashSet<u32> = done
            .iter()
            .take(done.len().saturating_sub(self.keep_resolved))
            .copied()
            .collect();
        markets.retain(|m| !old.contains(&m.id));
    }
}

fn thousands(n: u32) -> String {
    let s = n.to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use zpredict_oracle::{Block, FixtureChain};

    pub fn rolling() -> Rolling {
        Rolling {
            plugin: "shielded-actions".into(),
            interval_secs: 3600,
            horizon_secs: 3600,
            close_secs: 300,
            sample_blocks: 5,
            keep_resolved: 2,
            fast_from: 3_543_405,
        }
    }

    /// Blocks from `from` to `tip` with action counts cycling 0..10.
    fn chain(from: u32, tip: u32) -> FixtureChain {
        let blocks = (from..=tip)
            .map(|h| Block {
                height: h,
                hash: format!("{h:064x}"),
                shielded_actions: h % 10,
                ..Block::default()
            })
            .collect();
        FixtureChain { tip, blocks }
    }

    #[test]
    fn same_window_same_market_whatever_the_tip() {
        let r = rolling();
        // 3,527,040 · 75 s is a multiple of 3600 s: a window starts there.
        let c = chain(3_526_900, 3_527_100);
        let a = r.due(3_527_040, &[], &c).unwrap().unwrap();
        let b = r.due(3_527_087, &[], &c).unwrap().unwrap();
        assert_eq!(a, b);
        assert_eq!(a.id, ROLLING_ID_BASE + 3_527_040 * 75 / 3600);
        assert_eq!((a.close_height, a.resolve_height), (3_527_084, 3_527_088));
        // Heights 3,527,025..3,527,029 have 5..9 actions: the median is 7.
        assert_eq!(a.params, json!({"minActions": 7}));
        assert_eq!(
            a.question,
            "Will mainnet block 3,527,088 contain ≥ 7 shielded actions?"
        );
        let next = r
            .due(3_527_088, std::slice::from_ref(&a), &c)
            .unwrap()
            .unwrap();
        assert_eq!(next.id, a.id + 1);
        assert_eq!(r.due(3_527_050, &[a], &c).unwrap(), None, "already made");
    }

    #[test]
    fn spacing_drops_to_25_s_at_nu7() {
        let r = rolling();
        assert_eq!(r.secs(3_543_405) - r.secs(3_543_357), 3600);
        assert_eq!(r.secs(3_543_549) - r.secs(3_543_405), 3600);
        // A post-NU7 window spans 144 blocks and closes 12 blocks before H.
        let c = chain(3_550_000, 3_551_200);
        let m = r.due(3_550_900, &[], &c).unwrap().unwrap();
        assert_eq!(m.resolve_height - m.close_height, 12);
        let next = r
            .due(m.resolve_height, std::slice::from_ref(&m), &c)
            .unwrap()
            .unwrap();
        assert_eq!(next.resolve_height - m.resolve_height, 144);
    }

    #[test]
    fn cap_counts_markets_still_open_at_the_window_start() {
        let r = rolling();
        let c = chain(3_526_900, 3_527_100);
        let headline = |id, close| Market {
            id,
            close_height: close,
            rolling: false,
            ..r.due(3_527_040, &[], &c).unwrap().unwrap()
        };
        let three: Vec<Market> = (1..=3).map(|i| headline(i, 3_543_000)).collect();
        assert!(
            r.due(3_527_040, &three, &c).unwrap().is_some(),
            "3 + 1 fits"
        );
        let mut four = three.clone();
        four.push(headline(4, 3_560_000));
        assert_eq!(r.due(3_527_040, &four, &c).unwrap(), None);
        four[3].close_height = 3_527_000;
        assert!(
            r.due(3_527_040, &four, &c).unwrap().is_some(),
            "closed ones free a slot"
        );
    }

    #[test]
    fn prune_keeps_the_newest_resolved() {
        let r = rolling();
        let c = chain(3_526_900, 3_527_400);
        let mut list = Vec::new();
        for tip in [3_527_040, 3_527_088, 3_527_136, 3_527_184] {
            let mut m = r.due(tip, &list, &c).unwrap().unwrap();
            m.status = Status::Resolved;
            list.push(m);
        }
        list[3].status = Status::Open;
        r.prune(&mut list);
        let ids: Vec<u32> = list.iter().map(|m| m.id - list[0].id).collect();
        assert_eq!(ids, [0, 1, 2], "newest two resolved plus the open one");
        assert_eq!(thousands(3_543_405), "3,543,405");
        assert_eq!(thousands(999), "999");
    }
}
