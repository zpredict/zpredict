//! Market resolution from Zcash chain data.
//!
//! Each [`Market`] names a plugin; the plugin is a [`Resolver`] that reads a
//! [`Chain`] and returns a [`Resolution`] carrying the block it used, so anyone
//! can recompute the outcome against their own node.

mod chain;
mod fixture;
mod lightwalletd;
mod market;
mod outcome;
mod registry;
mod resolver;

pub use chain::{Block, CONFIRMATIONS, Chain, confirmed_block};
pub use fixture::FixtureChain;
pub use lightwalletd::Lightwalletd;
pub use market::{Market, Status};
pub use outcome::{Outcome, Resolution};
pub use registry::Registry;
pub use resolver::Resolver;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
