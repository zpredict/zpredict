//! The batch matcher: one relayer's side of the clearing and resolution computations.
//!
//! [`Polytune`] is the real one: the `zpredict-circuit` Garble programs under 3-party
//! polytune MPC, carried over our Noise links. [`InsecureLocalMatcher`] reveals every
//! order to relayer 0 and exists only for tests and local dev (`dev-insecure` feature).

#[cfg(any(test, feature = "dev-insecure"))]
mod insecure;

#[cfg(any(test, feature = "dev-insecure"))]
pub use insecure::InsecureLocalMatcher;
use zpredict_circuit::{Outcome, Position, Public, Shares};
use zpredict_core::{ACCOUNT_LEN, BALANCE_LEN, Side};

use crate::error::{Error, Result};
use crate::peers::Links;

pub trait Matcher {
    /// Clears one batch: `public` holds exactly [`zpredict_circuit::DEFAULT_MARKETS`]
    /// market slots (`0` = unused), a credit per table row and
    /// [`zpredict_circuit::DEFAULT_WITHDRAWALS`] withdrawal amounts; `shares` this
    /// relayer's shares of the orders, the table and the withdrawals' accounts. Padding
    /// is all-zero shares: price 0 orders (dummies), rows with balance 0, account 0.
    #[allow(async_fn_in_trait)] // runs on the batch thread via block_on; no Send needed
    async fn clear(&self, links: &Links, public: &Public, shares: &Shares<'_>) -> Result<Outcome>;

    /// Pays `market`'s winners (`outcome`, public) among `positions` into the table;
    /// returns this relayer's share of every row's new balance.
    #[allow(async_fn_in_trait)]
    async fn resolve(
        &self,
        links: &Links,
        market: u32,
        outcome: Side,
        positions: &[Position],
        accounts: &[[u8; ACCOUNT_LEN]],
    ) -> Result<Vec<[u8; BALANCE_LEN]>>;
}

/// The real matcher: one circuit run clears up to `DEFAULT_MARKETS` markets, with
/// balance checks, credits, withdrawals and a public clearing price per market; a
/// second program pays out resolved markets.
pub struct Polytune;

impl Matcher for Polytune {
    async fn clear(&self, links: &Links, public: &Public, shares: &Shares<'_>) -> Result<Outcome> {
        zpredict_circuit::run_party_on(links, links.party, public, shares)
            .await
            .map_err(|e| Error::Mpc(e.to_string()))
    }

    async fn resolve(
        &self,
        links: &Links,
        market: u32,
        outcome: Side,
        positions: &[Position],
        accounts: &[[u8; ACCOUNT_LEN]],
    ) -> Result<Vec<[u8; BALANCE_LEN]>> {
        let party = links.party;
        zpredict_circuit::run_resolution_on(links, party, market, outcome, positions, accounts)
            .await
            .map_err(|e| Error::Mpc(e.to_string()))
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
