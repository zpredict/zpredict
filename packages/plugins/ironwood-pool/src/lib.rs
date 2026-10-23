//! Market: "Will the Ironwood pool hold ≥ N notes at height H?"
//!
//! H is the market's resolve height. N counts Ironwood note commitments ever
//! created: the Ironwood commitment tree size at the end of block H, which any
//! lightwalletd/Zaino server returns in `CompactBlock.chainMetadata`.
//!
//! A ZEC-value variant ("≥ X ZEC") needs Zebra JSON-RPC (`getblock` →
//! `valuePools`, id `ironwood`); our relayers run their own Zebra, so it can be
//! added as a second `Chain` backend.
//!
//! Params: `{"minNotes": 100000}`.

use serde::Deserialize;
use zpredict_oracle::{Chain, Market, Resolution, Resolver, Result, confirmed_block};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Params {
    min_notes: u32,
}

pub struct IronwoodPool;

impl Resolver for IronwoodPool {
    fn resolve(&self, market: &Market, chain: &dyn Chain) -> Result<Option<Resolution>> {
        let p: Params = market.params()?;
        let Some(block) = confirmed_block(chain, market.resolve_height)? else {
            return Ok(None);
        };
        let yes = block.ironwood_notes >= p.min_notes;
        Ok(Some(Resolution::new(market, block, yes)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zpredict_oracle::{Block, FixtureChain, Lightwalletd, Outcome};

    fn market(height: u32, min_notes: u32) -> Market {
        serde_json::from_value(serde_json::json!({
            "id": 2, "question": "Will the Ironwood pool hold ≥ N notes at height H?",
            "plugin": "ironwood-pool", "params": {"minNotes": min_notes},
            "closeHeight": height - 100, "resolveHeight": height, "status": "closed"
        }))
        .unwrap()
    }

    #[test]
    fn threshold_is_inclusive() {
        let block = Block {
            height: 900,
            hash: "00cc".into(),
            ironwood_notes: 4_096,
            ..Block::default()
        };
        let chain = FixtureChain {
            tip: 910,
            blocks: vec![block],
        };
        let at = IronwoodPool
            .resolve(&market(900, 4_096), &chain)
            .unwrap()
            .unwrap();
        assert_eq!((at.outcome, at.block().unwrap().0), (Outcome::Yes, 900));
        let above = IronwoodPool
            .resolve(&market(900, 4_097), &chain)
            .unwrap()
            .unwrap();
        assert_eq!(above.outcome, Outcome::No);
        assert_eq!(IronwoodPool.resolve(&market(901, 1), &chain).unwrap(), None);
    }

    #[test]
    #[ignore = "network"]
    fn live_mainnet() {
        let node = Lightwalletd::new("https://zec.rocks:443").unwrap();
        let h = node.tip().unwrap() - 20;
        let r = IronwoodPool.resolve(&market(h, 1), &node).unwrap().unwrap();
        let notes = node.block(h).unwrap().unwrap().ironwood_notes;
        println!("{} notes={notes}", String::from_utf8(r.message()).unwrap());
        assert_eq!(r.outcome, Outcome::from(notes >= 1));
    }
}
