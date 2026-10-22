//! Chain tip and market status from the oracle lightwalletd: the chain the markets are
//! about (mainnet), never the escrow chain. Each poll: maybe a new rolling market
//! (`markets/rolling.rs`), then markets go open → closed at `closeHeight` → resolved once
//! the market's plugin can resolve it against this relayer's own node. Outcomes are signed
//! separately, in the batch loop (`outcome.rs`); a changed list is saved to `data_dir`.

use std::path::PathBuf;
use std::time::Duration;

use zpredict_oracle::{Chain, Lightwalletd, Market, Registry, Status};
use zpredict_plugin_ironwood_pool::IronwoodPool;
use zpredict_plugin_nu7_activation::Nu7Activation;
use zpredict_plugin_shielded_actions::ShieldedActions;

use crate::markets::{self, Rolling};
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
pub fn poll(url: &str, state: Shared, rolling: Option<Rolling>, dir: PathBuf) {
    let (node, reg) = match Lightwalletd::new(url) {
        Ok(n) => (n, registry()),
        Err(e) => return eprintln!("chain: {e}"),
    };
    let mut saved = Vec::new();
    loop {
        if let Err(e) = tick(&node, &reg, &state, rolling.as_ref()) {
            eprintln!("chain: {e}");
        }
        let now = state.lock().expect("state lock").markets.clone();
        if now != saved {
            match markets::save(&dir, &now) {
                Ok(()) => saved = now,
                Err(e) => eprintln!("chain: saving markets: {e}"),
            }
        }
        std::thread::sleep(POLL);
    }
}

/// One poll. Chain reads happen outside the state lock; the results are then applied
/// field by field, so a signature the batch loop added meanwhile is kept.
pub fn tick(
    chain: &dyn Chain,
    reg: &Registry,
    state: &Shared,
    rolling: Option<&Rolling>,
) -> zpredict_oracle::Result<()> {
    let tip = chain.tip()?;
    let mut list = state.lock().expect("state lock").markets.clone();
    if let Some(r) = rolling {
        match r.due(tip, &list, chain) {
            Ok(m) => list.extend(m),
            Err(e) => eprintln!("chain: rolling market: {e}"),
        }
    }
    let list: Vec<Market> = (list.into_iter())
        .map(|m| advance(m, tip, chain, reg))
        .collect();
    let mut s = state.lock().expect("state lock");
    s.height = tip;
    for new in list {
        match s.markets.iter_mut().find(|m| m.id == new.id) {
            Some(m) => {
                m.status = new.status;
                if let Some(r) = new.resolution() {
                    m.set_resolution(&r);
                }
            }
            None => s.markets.push(new),
        }
    }
    if let Some(r) = rolling {
        r.prune(&mut s.markets);
    }
    Ok(())
}

/// The market's status at `tip`; resolving records the outcome and its block.
pub fn advance(mut m: Market, tip: u32, chain: &dyn Chain, reg: &Registry) -> Market {
    if m.status == Status::Open && tip >= m.close_height {
        m.status = Status::Closed;
    }
    if m.status == Status::Closed && tip >= m.resolve_height {
        match reg.resolve(&m, chain) {
            Ok(Some(r)) => m.set_resolution(&r),
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
        assert_eq!(
            (m.block_height, m.block_hash.as_deref()),
            (Some(100), Some("ab"))
        );
    }
}
