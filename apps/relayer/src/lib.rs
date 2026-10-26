//! zPredict relayer: one of three parties. It takes one XOR share per order over HTTP,
//! batches with its two peers over Noise-authenticated links, runs the clearing circuit
//! as one MPC party, and serves its own fill and balance shares back to the browser.
//! It never sees an order, a fill or a balance in the clear.

pub mod api;
pub mod batch;
pub mod chain;
pub mod config;
pub mod error;
pub mod escrow;
pub mod keys;
pub mod ledger;
pub mod markets;
pub mod mpc;
pub mod outcome;
pub mod peers;
pub mod price;
pub mod reference;
pub mod server;
pub mod state;
pub mod store;
pub mod table;
#[cfg(test)]
mod tests;

pub use config::Config;
pub use error::{Error, Result};
