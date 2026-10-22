//! Market resolution from Zcash chain data.
//!
//! Each market names a plugin; the plugin is a [`Resolver`] that reads the
//! [`Chain`] and returns a [`Resolution`] carrying the block it used, so anyone
//! can recompute the outcome against their own node.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

mod lightwalletd;
pub use lightwalletd::Lightwalletd;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

/// Blocks that must sit on top of a height before it is used for resolution,
/// so a shallow reorg cannot flip a published outcome.
pub const CONFIRMATIONS: u32 = 10;

/// A market as served by the relayer API.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Market {
    pub id: u32,
    pub question: String,
    pub plugin: String,
    pub params: serde_json::Value,
    pub close_height: u32,
    pub resolve_height: u32,
    pub status: Status,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome: Option<Outcome>,
    /// Hex FROST signature over [`Resolution::message`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome_sig: Option<String>,
}

impl Market {
    /// Deserializes this market's plugin parameters.
    pub fn params<T: serde::de::DeserializeOwned>(&self) -> Result<T> {
        Ok(serde_json::from_value(self.params.clone())?)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Open,
    Closed,
    Resolved,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Yes,
    No,
}

impl From<bool> for Outcome {
    fn from(yes: bool) -> Self {
        if yes { Outcome::Yes } else { Outcome::No }
    }
}

/// An outcome plus the exact block it was computed from.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolution {
    pub market: u32,
    pub outcome: Outcome,
    pub height: u32,
    /// Block hash in the usual display order (byte-reversed hex).
    pub block_hash: String,
}

impl Resolution {
    pub fn new(market: &Market, block: Block, yes: bool) -> Self {
        Self {
            market: market.id,
            outcome: yes.into(),
            height: block.height,
            block_hash: block.hash,
        }
    }

    /// The bytes the relayers sign.
    // TODO(settle): FROST 2-of-3 signs these bytes; the signature goes into
    // `Market::outcome_sig`. Until the settle crate lands, outcomes are unsigned.
    pub fn message(&self) -> Vec<u8> {
        serde_json::to_vec(self).expect("plain struct serializes")
    }
}

/// The block data plugins read.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Block {
    pub height: u32,
    /// Byte-reversed hex, as block explorers show it.
    pub hash: String,
    /// Consensus branch ID from the coinbase transaction header.
    pub branch_id: u32,
    /// Sapling spends + Sapling outputs + Orchard actions + Ironwood actions.
    pub shielded_actions: u32,
    /// Size of the Ironwood note commitment tree at the end of this block.
    pub ironwood_notes: u32,
}

/// Node access. `block` returns `None` for heights above the tip.
pub trait Chain {
    fn tip(&self) -> Result<u32>;
    fn block(&self, height: u32) -> Result<Option<Block>>;
}

/// The block at `height`, once it has [`CONFIRMATIONS`]; `None` before that.
pub fn confirmed_block(chain: &dyn Chain, height: u32) -> Result<Option<Block>> {
    if chain.tip()? < height.saturating_add(CONFIRMATIONS) {
        return Ok(None);
    }
    chain.block(height)
}

/// A market type. Returns `None` while the market is not yet resolvable.
pub trait Resolver: Send + Sync {
    fn resolve(&self, market: &Market, chain: &dyn Chain) -> Result<Option<Resolution>>;
}

/// Plugin name → resolver.
#[derive(Default)]
pub struct Registry(HashMap<String, Box<dyn Resolver>>);

impl Registry {
    pub fn register(&mut self, name: &str, resolver: impl Resolver + 'static) -> &mut Self {
        self.0.insert(name.to_owned(), Box::new(resolver));
        self
    }

    pub fn resolve(&self, market: &Market, chain: &dyn Chain) -> Result<Option<Resolution>> {
        let resolver = self
            .0
            .get(&market.plugin)
            .ok_or_else(|| format!("unknown plugin {:?}", market.plugin))?;
        resolver.resolve(market, chain)
    }
}

/// In-memory chain for tests.
#[derive(Default)]
pub struct FixtureChain {
    pub tip: u32,
    pub blocks: Vec<Block>,
}

impl Chain for FixtureChain {
    fn tip(&self) -> Result<u32> {
        Ok(self.tip)
    }

    fn block(&self, height: u32) -> Result<Option<Block>> {
        if height > self.tip {
            return Ok(None);
        }
        let block = self.blocks.iter().find(|b| b.height == height);
        Ok(Some(block.cloned().ok_or("fixture has no such block")?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct AlwaysYes;
    impl Resolver for AlwaysYes {
        fn resolve(&self, m: &Market, chain: &dyn Chain) -> Result<Option<Resolution>> {
            Ok(confirmed_block(chain, m.resolve_height)?.map(|b| Resolution::new(m, b, true)))
        }
    }

    const JSON: &str = r#"{"id":7,"question":"q?","plugin":"yes","params":{},"closeHeight":90,"resolveHeight":100,"status":"open"}"#;

    #[test]
    fn market_json_round_trips() {
        let m: Market = serde_json::from_str(JSON).unwrap();
        assert_eq!(m.status, Status::Open);
        assert_eq!(serde_json::to_string(&m).unwrap(), JSON);
    }

    #[test]
    fn registry_waits_for_confirmations() {
        let m: Market = serde_json::from_str(JSON).unwrap();
        let mut reg = Registry::default();
        reg.register("yes", AlwaysYes);
        let block = Block {
            height: 100,
            hash: "ab".into(),
            ..Block::default()
        };
        let mut chain = FixtureChain {
            tip: 109,
            blocks: vec![block],
        };
        assert_eq!(reg.resolve(&m, &chain).unwrap(), None);
        chain.tip = 110;
        let r = reg.resolve(&m, &chain).unwrap().unwrap();
        assert_eq!((r.height, r.block_hash.as_str()), (100, "ab"));

        let unknown = Market {
            plugin: "nope".into(),
            ..m
        };
        assert!(reg.resolve(&unknown, &chain).is_err());
    }
}
