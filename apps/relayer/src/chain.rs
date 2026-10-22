//! Chain tip and market status from the oracle lightwalletd: the chain the markets are
//! about (mainnet), never the escrow chain. Markets go open → closed at `closeHeight`,
//! → resolved once the market's plugin can resolve it against this relayer's own node.

use std::time::Duration;

use zpredict_oracle::{Chain, Lightwalletd, Market, Registry, Status};
use zpredict_plugin_ironwood_pool::IronwoodPool;
use zpredict_plugin_nu7_activation::Nu7Activation;
use zpredict_plugin_shielded_actions::ShieldedActions;

use crate::state::Shared;

const POLL: Duration = Duration::from_secs(30);

pub fn registry() -> Registry {
    let mut r = Registry::default();
    r.register("nu7-activation", Nu7Activation)
        .register("ironwood-pool", IronwoodPool)
        .register("shielded-actions", ShieldedActions);
    r
}

/// Polls forever on a blocking thread (the oracle client is blocking).
pub fn poll(url: &str, state: Shared) {
    let (node, reg) = match Lightwalletd::new(url) {
        Ok(n) => (n, registry()),
        Err(e) => return eprintln!("chain: {e}"),
    };
    loop {
        match node.tip() {
            Ok(tip) => {
                let markets = state.lock().expect("state lock").markets.clone();
                let markets = markets
                    .into_iter()
                    .map(|m| advance(m, tip, &node, &reg))
                    .collect();
                let mut s = state.lock().expect("state lock");
                (s.height, s.markets) = (tip, markets);
            }
            Err(e) => eprintln!("chain: {e}"),
        }
        std::thread::sleep(POLL);
    }
}

/// The market's status at `tip`. Outcomes stay unsigned until the FROST signer lands.
pub fn advance(mut m: Market, tip: u32, chain: &dyn Chain, reg: &Registry) -> Market {
    if m.status == Status::Open && tip >= m.close_height {
        m.status = Status::Closed;
    }
    if m.status == Status::Closed && tip >= m.resolve_height {
        match reg.resolve(&m, chain) {
            Ok(Some(r)) => (m.status, m.outcome) = (Status::Resolved, Some(r.outcome)),
            Ok(None) => {}
            Err(e) => eprintln!("chain: market {}: {e}", m.id),
        }
    }
    m
}

#[cfg(test)]
mod tests {
    use super::*;
    use zpredict_oracle::{Block, FixtureChain, Outcome};

    #[test]
    fn closes_then_resolves() {
        let m: Market = serde_json::from_value(serde_json::json!({
            "id": 1, "question": "q?", "plugin": "shielded-actions",
            "params": {"minActions": 2},
            "closeHeight": 90, "resolveHeight": 100, "status": "open"
        }))
        .unwrap();
        let block = Block {
            height: 100,
            hash: "ab".into(),
            shielded_actions: 3,
            ..Block::default()
        };
        let chain = FixtureChain {
            tip: 95,
            blocks: vec![block],
        };
        let reg = registry();
        let m = advance(m, 95, &chain, &reg);
        assert_eq!(m.status, Status::Closed);
        let chain = FixtureChain { tip: 120, ..chain };
        let m = advance(m, 120, &chain, &reg);
        assert_eq!(
            (m.status, m.outcome),
            (Status::Resolved, Some(Outcome::Yes))
        );
    }
}
