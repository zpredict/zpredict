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
    /// Each market slot's public clearing price (YES half-ticks), in the order the
    /// markets were passed; identical at all three relayers.
    pub prices: Vec<Option<u16>>,
}

pub trait Matcher {
    /// Clears one batch for `markets` (exactly [`zpredict_circuit::DEFAULT_MARKETS`]
    /// slots, `0` = unused; orders of other markets come back as zero records).
    /// `orders[k]` / `accounts[r]` are this relayer's shares of slot `k` / table row
    /// `r`. Padding is all-zero shares: price 0 orders (dummies) and rows with balance 0.
    /// `credits[r]` (public, the same at all three relayers) is added to row `r` before
    /// clearing.
    #[allow(async_fn_in_trait)] // runs on the batch thread via block_on; no Send needed
    async fn clear(
        &self,
        links: &Links,
        markets: &[u32],
        credits: &[u64],
        orders: &[[u8; ORDER_LEN]],
        accounts: &[[u8; ACCOUNT_LEN]],
    ) -> Result<Cleared>;
}

/// The real matcher: one circuit run clears up to `DEFAULT_MARKETS` markets, with
/// balance checks, credits and a public clearing price per market.
pub struct Polytune;

impl Matcher for Polytune {
    async fn clear(
        &self,
        links: &Links,
        markets: &[u32],
        credits: &[u64],
        orders: &[[u8; ORDER_LEN]],
        accounts: &[[u8; ACCOUNT_LEN]],
    ) -> Result<Cleared> {
        let out =
            zpredict_circuit::run_party_on(links, links.party, markets, credits, orders, accounts)
                .await
                .map_err(|e| Error::Mpc(e.to_string()))?;
        Ok(Cleared {
            fills: out.fills,
            balances: out.balances,
            prices: out.prices,
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
