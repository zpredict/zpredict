//! "Will NU7 activate at height H?" — YES iff the coinbase transaction of
//! block H carries the NU7 consensus branch ID.
//!
//! Params: `{"activationHeight": 3543405}` (mainnet target, ZIP 259).

use serde::Deserialize;
use zpredict_oracle::{Chain, Market, Resolution, Resolver, Result, confirmed_block};

/// NU7 consensus branch ID.
pub const NU7_BRANCH_ID: u32 = 0x7719_0ad9;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Params {
    activation_height: u32,
}

pub struct Nu7Activation;

impl Resolver for Nu7Activation {
    fn resolve(&self, market: &Market, chain: &dyn Chain) -> Result<Option<Resolution>> {
        let p: Params = market.params()?;
        let Some(block) = confirmed_block(chain, p.activation_height)? else {
            return Ok(None);
        };
        let yes = block.branch_id == NU7_BRANCH_ID;
        Ok(Some(Resolution::new(market, block, yes)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zpredict_oracle::{Block, FixtureChain, Lightwalletd, Outcome};

    fn market(height: u32) -> Market {
        serde_json::from_value(serde_json::json!({
            "id": 1, "question": "Will NU7 activate at this height?", "plugin": "nu7-activation",
            "params": {"activationHeight": height},
            "closeHeight": height - 100, "resolveHeight": height, "status": "closed"
        }))
        .unwrap()
    }

    fn chain(branch_id: u32, tip: u32) -> FixtureChain {
        let block = Block {
            height: 3_543_405,
            hash: "00aa".into(),
            branch_id,
            ..Block::default()
        };
        FixtureChain {
            tip,
            blocks: vec![block],
        }
    }

    #[test]
    fn resolves_from_branch_id() {
        let m = market(3_543_405);
        let yes = Nu7Activation
            .resolve(&m, &chain(NU7_BRANCH_ID, 3_543_415))
            .unwrap()
            .unwrap();
        assert_eq!(
            (yes.outcome, yes.block()),
            (Outcome::Yes, Some((3_543_405, "00aa")))
        );
        // NU6 branch ID: the upgrade slipped.
        let no = Nu7Activation
            .resolve(&m, &chain(0xc8e7_1055, 3_543_415))
            .unwrap()
            .unwrap();
        assert_eq!(no.outcome, Outcome::No);
        assert_eq!(
            Nu7Activation
                .resolve(&m, &chain(NU7_BRANCH_ID, 3_543_414))
                .unwrap(),
            None
        );
    }

    /// Testnet activated NU7 at 4,465,026 (Zebra v7.0.0-rc.0).
    #[test]
    #[ignore = "network"]
    fn live_testnet() {
        let node = Lightwalletd::new("https://testnet.zec.rocks:443").unwrap();
        let r = Nu7Activation
            .resolve(&market(4_465_026), &node)
            .unwrap()
            .unwrap();
        println!("{}", String::from_utf8(r.message()).unwrap());
        assert_eq!(r.outcome, Outcome::Yes);
        let before = Nu7Activation
            .resolve(&market(4_465_025), &node)
            .unwrap()
            .unwrap();
        assert_eq!(before.outcome, Outcome::No);
    }
}
