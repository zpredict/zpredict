//! The batch matcher: one relayer's side of the clearing and resolution computations.
//!
//! [`Polytune`] is the real one: the `zpredict-circuit` Garble programs under 3-party
//! polytune MPC, carried over our Noise links. [`InsecureLocalMatcher`] reveals every
//! order to relayer 0 and exists only for tests and local dev (`dev-insecure` feature).

#[cfg(any(test, feature = "dev-insecure"))]
mod insecure;

#[cfg(any(test, feature = "dev-insecure"))]
pub use insecure::InsecureLocalMatcher;
use zpredict_circuit::{
    DEFAULT_MARKETS, DEFAULT_WITHDRAWALS, Outcome, Position, Public, Shares, Table,
};
use zpredict_core::{BALANCE_LEN, Side};

use crate::error::{Error, Result};
use crate::peers::Links;

pub trait Matcher {
    /// A clearing run's input-independent part, made before the batch is known.
    type Pre: Send;

    /// Compiles what the first batch would otherwise compile inside its run.
    fn warm_up(&self, _slots: usize, _rows: usize) {}

    /// Preprocesses one clearing run with `slots` order slots and `rows` table rows (all
    /// three relayers together), for exactly one [`Matcher::clear`].
    #[allow(async_fn_in_trait)]
    async fn preprocess(&self, links: &Links, slots: usize, rows: usize) -> Result<Self::Pre>;

    /// Clears one batch: `public` holds exactly [`zpredict_circuit::DEFAULT_MARKETS`]
    /// market slots (`0` = unused), a credit per table row and
    /// [`zpredict_circuit::DEFAULT_WITHDRAWALS`] withdrawal amounts; `shares` this
    /// relayer's shares of the orders, the table (rows and keys) and the withdrawals'
    /// keys. Padding is all-zero shares: price 0 orders (dummies), rows with balance 0,
    /// key 0.
    /// `pre`: material from [`Matcher::preprocess`] for this run, else it preprocesses too.
    #[allow(async_fn_in_trait)] // runs on the batch thread via block_on; no Send needed
    async fn clear(
        &self,
        links: &Links,
        public: &Public,
        shares: &Shares<'_>,
        pre: Option<Self::Pre>,
    ) -> Result<Outcome>;

    /// Pays `market`'s winners (`outcome`, public) among `positions` into the table;
    /// returns this relayer's share of every row's new balance.
    #[allow(async_fn_in_trait)]
    async fn resolve(
        &self,
        links: &Links,
        market: u32,
        outcome: Side,
        positions: &[Position],
        table: Table<'_>,
    ) -> Result<Vec<[u8; BALANCE_LEN]>>;
}

/// The real matcher: one circuit run clears up to `DEFAULT_MARKETS` markets, with
/// balance checks, credits, withdrawals and a public clearing price per market; a
/// second program pays out resolved markets.
pub struct Polytune;

impl Matcher for Polytune {
    type Pre = zpredict_circuit::Preprocessed;

    fn warm_up(&self, slots: usize, rows: usize) {
        let _ = zpredict_circuit::program(slots, rows, DEFAULT_MARKETS, DEFAULT_WITHDRAWALS);
        let _ = zpredict_circuit::resolve_program(zpredict_circuit::DEFAULT_POSITIONS, rows);
    }

    async fn preprocess(&self, links: &Links, slots: usize, rows: usize) -> Result<Self::Pre> {
        let prg = zpredict_circuit::program(slots, rows, DEFAULT_MARKETS, DEFAULT_WITHDRAWALS);
        zpredict_circuit::preprocess(links, links.party, prg)
            .await
            .map_err(|e| Error::Mpc(e.to_string()))
    }

    async fn clear(
        &self,
        links: &Links,
        public: &Public,
        shares: &Shares<'_>,
        pre: Option<Self::Pre>,
    ) -> Result<Outcome> {
        zpredict_circuit::run_party_with(links, links.party, public, shares, pre)
            .await
            .map_err(|e| Error::Mpc(e.to_string()))
    }

    async fn resolve(
        &self,
        links: &Links,
        market: u32,
        outcome: Side,
        positions: &[Position],
        table: Table<'_>,
    ) -> Result<Vec<[u8; BALANCE_LEN]>> {
        let party = links.party;
        zpredict_circuit::run_resolution_on(links, party, market, outcome, positions, table)
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
