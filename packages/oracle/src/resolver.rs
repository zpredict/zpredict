//! The interface every market plugin implements.

use crate::{Chain, Market, Resolution, Result};

/// A market type. Returns `None` while the market is not yet resolvable.
pub trait Resolver: Send + Sync {
    fn resolve(&self, market: &Market, chain: &dyn Chain) -> Result<Option<Resolution>>;
}
