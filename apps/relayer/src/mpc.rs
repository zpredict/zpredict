//! The batch matcher: one relayer's side of the clearing computation.
//!
//! [`Polytune`] is the real one: the `zpredict-circuit` Garble program under 3-party
//! polytune MPC, carried over our Noise links. [`InsecureLocalMatcher`] reveals every
//! order to relayer 0 and exists only for tests and local dev (`dev-insecure` feature).

use zpredict_core::{FILL_LEN, ORDER_LEN};

use crate::error::{Error, Result};
use crate::peers::Links;

/// One relayer's output of a batch.
#[derive(Debug, Default)]
pub struct Cleared {
    /// This relayer's XOR share of each slot's `zpredict_core::fill_records` record.
    pub fills: Vec<[u8; FILL_LEN]>,
    /// Public clearing prices `(market, YES half-ticks)`, identical at all three relayers.
    pub prices: Vec<(u32, u16)>,
}

pub trait Matcher {
    /// Slots per batch this matcher needs (`None` = any).
    fn slots(&self) -> Option<usize>;

    /// Clears one batch. `shares[k]` is this relayer's share of slot `k`; padding slots
    /// are all-zero shares, which rebuild to price 0 and so decode as dummies.
    #[allow(async_fn_in_trait)] // runs on the batch thread's own runtime; no Send needed
    async fn clear(&self, links: &Links, shares: &[[u8; ORDER_LEN]]) -> Result<Cleared>;
}

/// The real matcher. Known gaps (see the crate README): the circuit ignores the market
/// id, publishes no clearing price, and checks no balances (#41).
pub struct Polytune;

impl Matcher for Polytune {
    fn slots(&self) -> Option<usize> {
        Some(zpredict_circuit::N)
    }

    async fn clear(&self, links: &Links, shares: &[[u8; ORDER_LEN]]) -> Result<Cleared> {
        let shares: zpredict_circuit::OrderShares = shares
            .try_into()
            .map_err(|_| Error::Mpc(format!("batch must have {} slots", zpredict_circuit::N)))?;
        let fills = zpredict_circuit::run_party_on(links, links.party, &shares)
            .await
            .map_err(|e| Error::Mpc(e.to_string()))?;
        // ponytail: no public price output in the circuit yet, so lastPrice/history stay
        // empty under real MPC; add a public `(market, price)` output to the circuit.
        Ok(Cleared {
            fills: fills.to_vec(),
            prices: Vec::new(),
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

/// INSECURE: parties 1 and 2 send their shares to party 0, which rebuilds every order,
/// clears each market with `zpredict_core::clear` and hands back fresh fill shares.
/// Only for tests and local dev before real hosts; `main` refuses it unless both the
/// `dev-insecure` feature and `insecure_matcher = true` are set.
#[cfg(any(test, feature = "dev-insecure"))]
pub struct InsecureLocalMatcher;

#[cfg(any(test, feature = "dev-insecure"))]
mod insecure {
    use serde::{Deserialize, Serialize};
    use zpredict_core::{FILL_LEN, ORDER_LEN, Order, clear, fill_records};

    use super::{Cleared, InsecureLocalMatcher, Matcher};
    use crate::error::Result;
    use crate::peers::Links;

    #[derive(Serialize, Deserialize)]
    struct Reply {
        fills: Vec<[u8; FILL_LEN]>,
        prices: Vec<(u32, u16)>,
    }

    impl Matcher for InsecureLocalMatcher {
        fn slots(&self) -> Option<usize> {
            None
        }

        async fn clear(&self, links: &Links, shares: &[[u8; ORDER_LEN]]) -> Result<Cleared> {
            if links.party != 0 {
                links.send(0, &serde_json::to_vec(shares)?).await?;
                let r: Reply = serde_json::from_slice(&links.recv(0).await?)?;
                return Ok(Cleared {
                    fills: r.fills,
                    prices: r.prices,
                });
            }
            let mut all = shares.to_vec();
            for p in 1..3 {
                let theirs: Vec<[u8; ORDER_LEN]> = serde_json::from_slice(&links.recv(p).await?)?;
                for (a, b) in all.iter_mut().zip(theirs) {
                    a.iter_mut().zip(b).for_each(|(x, y)| *x ^= y);
                }
            }
            let (records, prices) = clear_by_market(&all);
            let mut mine = records.clone();
            for p in 1..3 {
                let mut r = Reply {
                    fills: vec![[0u8; FILL_LEN]; records.len()],
                    prices: prices.clone(),
                };
                for (m, s) in mine.iter_mut().zip(&mut r.fills) {
                    getrandom::fill(s).expect("os rng");
                    m.iter_mut().zip(s.iter()).for_each(|(x, y)| *x ^= y);
                }
                links.send(p, &serde_json::to_vec(&r)?).await?;
            }
            Ok(Cleared {
                fills: mine,
                prices,
            })
        }
    }

    /// Plaintext reference: clears each market separately; the price is the YES cost of
    /// the market's last (marginal) cross.
    pub(crate) fn clear_by_market(
        rebuilt: &[[u8; ORDER_LEN]],
    ) -> (Vec<[u8; FILL_LEN]>, Vec<(u32, u16)>) {
        let orders: Vec<Option<Order>> = rebuilt.iter().map(Order::decode).collect();
        let mut out = vec![[0u8; FILL_LEN]; rebuilt.len()];
        let mut markets: Vec<u32> = orders.iter().flatten().map(|o| o.market).collect();
        markets.sort();
        markets.dedup();
        let mut prices = Vec::new();
        for m in markets {
            let idx: Vec<usize> = (0..orders.len())
                .filter(|&k| orders[k].is_some_and(|o| o.market == m))
                .collect();
            let sub: Vec<Order> = idx.iter().map(|&k| orders[k].expect("filtered")).collect();
            let fills = clear(&sub);
            if let Some(last) = fills.last() {
                prices.push((m, last.yes_cost));
            }
            for (k, r) in idx.iter().zip(fill_records(&sub, &fills)) {
                out[*k] = r;
            }
        }
        (out, prices)
    }
}
