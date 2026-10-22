//! Plugin name → resolver.

use std::collections::HashMap;

use crate::{Chain, Error, Market, Resolution, Resolver, Result};

#[derive(Default)]
pub struct Registry(HashMap<String, Box<dyn Resolver>>);

impl Registry {
    pub fn register(&mut self, name: &str, resolver: impl Resolver + 'static) -> &mut Self {
        self.0.insert(name.to_owned(), Box::new(resolver));
        self
    }

    /// Resolves `market` with the plugin it names.
    pub fn resolve(&self, market: &Market, chain: &dyn Chain) -> Result<Option<Resolution>> {
        let resolver = self
            .0
            .get(&market.plugin)
            .ok_or_else(|| Error::UnknownPlugin(market.plugin.clone()))?;
        resolver.resolve(market, chain)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Block, FixtureChain, confirmed_block};

    struct AlwaysYes;

    impl Resolver for AlwaysYes {
        fn resolve(&self, m: &Market, chain: &dyn Chain) -> Result<Option<Resolution>> {
            Ok(confirmed_block(chain, m.resolve_height)?.map(|b| Resolution::new(m, b, true)))
        }
    }

    #[test]
    fn dispatches_and_waits_for_confirmations() {
        let m: Market = serde_json::from_value(serde_json::json!({
            "id": 7, "question": "q?", "plugin": "yes", "params": {},
            "closeHeight": 90, "resolveHeight": 100, "status": "open"
        }))
        .unwrap();
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
