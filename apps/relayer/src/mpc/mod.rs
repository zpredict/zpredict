//! The batch matcher: one relayer's side of the clearing computation.
//!
//! [`Polytune`] is the real one: the `zpredict-circuit` Garble program under 3-party
//! polytune MPC, carried over our Noise links. [`InsecureLocalMatcher`] reveals every
//! order to relayer 0 and exists only for tests and local dev (`dev-insecure` feature).

#[cfg(any(test, feature = "dev-insecure"))]
mod insecure;

#[cfg(any(test, feature = "dev-insecure"))]
pub use insecure::InsecureLocalMatcher;
use zpredict_core::{ACCOUNT_LEN, BALANCE_LEN, FILL_LEN, ORDER_LEN};

use crate::error::{Error, Result};
use crate::peers::Links;

/// One relayer's output of one matcher run.
#[derive(Debug, Default)]
pub struct Cleared {
    /// This relayer's XOR share of each slot's `zpredict_core::fill_records` record.
    pub fills: Vec<[u8; FILL_LEN]>,
    /// This relayer's XOR share of each table row's new balance.
    pub balances: Vec<[u8; BALANCE_LEN]>,
    /// The run's public clearing price (YES half-ticks), identical at all three relayers.
    pub price: Option<u16>,
}

pub trait Matcher {
    /// Order slots the circuit is built for; `None` = any. Table rows are configurable
    /// (`table_rows`).
    fn slots(&self) -> Option<usize>;

    /// True when a run clears only `market` (other markets' slots come back as zero
    /// records), so the batch loop runs once per open market and XORs the fill shares.
    /// False: one run per window and `market` is ignored.
    fn per_market(&self) -> bool;

    /// Clears one batch. `orders[k]` / `accounts[r]` are this relayer's shares of slot
    /// `k` / table row `r`. Padding is all-zero shares: price 0 orders (dummies) and
    /// rows with balance 0. `credits[r]` (public, the same at all three relayers) is
    /// added to row `r` before clearing.
    #[allow(async_fn_in_trait)] // runs on the batch thread via block_on; no Send needed
    async fn clear(
        &self,
        links: &Links,
        market: u32,
        credits: &[u64],
        orders: &[[u8; ORDER_LEN]],
        accounts: &[[u8; ACCOUNT_LEN]],
    ) -> Result<Cleared>;
}

/// The real matcher: one circuit run per market, with balance checks, credits and the
/// public clearing price.
pub struct Polytune;

impl Matcher for Polytune {
    fn slots(&self) -> Option<usize> {
        Some(zpredict_circuit::N)
    }

    fn per_market(&self) -> bool {
        true
    }

    async fn clear(
        &self,
        links: &Links,
        market: u32,
        credits: &[u64],
        orders: &[[u8; ORDER_LEN]],
        accounts: &[[u8; ACCOUNT_LEN]],
    ) -> Result<Cleared> {
        let out =
            zpredict_circuit::run_party_on(links, links.party, market, credits, orders, accounts)
                .await
                .map_err(|e| Error::Mpc(e.to_string()))?;
        Ok(Cleared {
            fills: out.fills,
            balances: out.balances,
            price: out.price,
        })
    }
}

impl polytune::channel::Channel for Links {
    type SendError = Error;
    type RecvError = Error;

    async fn send_bytes_to(&self, p: usize, data: Vec<u8>, _phase: &str) -> Result<()> {
        self.send(p, &data).await
    }

    async fn recv_bytes_from(&self, p: usize, _phase: &str) -> Result<Vec<u8>> {
        self.recv(p).await
    }
}
