//! "Will block H contain at least N shielded actions?" — H is the market's
//! resolve height. Actions = Sapling spends + Sapling outputs + Orchard actions
//! + Ironwood actions, counted from the compact block.
//!
//! Params: `{"minActions": 100}`.

use serde::Deserialize;
use zpredict_oracle::{Chain, Market, Resolution, Resolver, Result, confirmed_block};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Params {
    min_actions: u32,
}

pub struct ShieldedActions;

impl Resolver for ShieldedActions {
    fn resolve(&self, market: &Market, chain: &dyn Chain) -> Result<Option<Resolution>> {
        let p: Params = market.params()?;
        let Some(block) = confirmed_block(chain, market.resolve_height)? else {
            return Ok(None);
        };
        let yes = block.shielded_actions >= p.min_actions;
        Ok(Some(Resolution::new(market, block, yes)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zpredict_oracle::{Block, FixtureChain, Lightwalletd, Outcome};

    fn market(height: u32, min_actions: u32) -> Market {
        serde_json::from_value(serde_json::json!({
            "id": 3, "question": "Will this block hold enough shielded actions?",
            "plugin": "shielded-actions", "params": {"minActions": min_actions},
            "closeHeight": height - 100, "resolveHeight": height, "status": "closed"
        }))
        .unwrap()
    }

    #[test]
    fn threshold_is_inclusive() {
        let block = Block {
            height: 500,
            hash: "00bb".into(),
            shielded_actions: 12,
            ..Block::default()
        };
        let chain = FixtureChain {
            tip: 510,
            blocks: vec![block],
        };
        let at = ShieldedActions
            .resolve(&market(500, 12), &chain)
            .unwrap()
            .unwrap();
        assert_eq!((at.outcome, at.block().unwrap().1), (Outcome::Yes, "00bb"));
        let above = ShieldedActions
            .resolve(&market(500, 13), &chain)
            .unwrap()
            .unwrap();
        assert_eq!(above.outcome, Outcome::No);
        assert_eq!(
            ShieldedActions.resolve(&market(501, 1), &chain).unwrap(),
            None
        );
    }

    #[test]
    #[ignore = "network"]
    fn live_mainnet() {
        let node = Lightwalletd::new("https://zec.rocks:443").unwrap();
        let h = node.tip().unwrap() - 20;
        let r = ShieldedActions
            .resolve(&market(h, 1), &node)
            .unwrap()
            .unwrap();
        let actions = node.block(h).unwrap().unwrap().shielded_actions;
        println!(
            "{} actions={actions}",
            String::from_utf8(r.message()).unwrap()
        );
        assert_eq!(r.outcome, Outcome::from(actions >= 1));
    }
}
