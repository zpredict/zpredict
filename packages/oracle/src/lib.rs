//! Market resolution from Zcash chain data, or from an outside oracle.
//!
//! Each [`Market`] names a plugin; the plugin is a [`Resolver`] that reads a
//! [`Chain`] and returns a [`Resolution`] carrying the block it used, so anyone
//! can recompute the outcome against their own node. Mirrored markets (the
//! `polymarket` plugin) carry the oracle and its market id instead ([`Evidence`]).

mod backend;
mod chain;
mod error;
#[cfg(any(test, feature = "fixture"))]
mod fixture;
mod market;
mod outcome;
mod registry;
mod resolver;

pub use backend::Lightwalletd;
pub use chain::{Block, CONFIRMATIONS, Chain, confirmed_block};
pub use error::{Error, Result};
#[cfg(any(test, feature = "fixture"))]
pub use fixture::FixtureChain;
pub use market::{Event, Info, Market, Status};
pub use outcome::{Evidence, MESSAGE_PREFIX, Outcome, Resolution};
pub use registry::Registry;
pub use resolver::Resolver;
