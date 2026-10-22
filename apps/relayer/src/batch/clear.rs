//! Clearing a batch: one matcher run per group of open markets.

use zpredict_circuit::{DEFAULT_MARKETS, Public, Shares};
use zpredict_core::{BALANCE_LEN, FILL_LEN};

use super::Batcher;
use crate::error::{Error, Result};
use crate::mpc::Matcher;
use crate::peers::Links;

/// One relayer's result of clearing a batch.
#[derive(Default)]
pub struct Cleared {
    pub fills: Vec<[u8; FILL_LEN]>,
    pub balances: Vec<[u8; BALANCE_LEN]>,
    /// Public clearing prices `(market, YES half-ticks)` of markets that crossed.
    pub prices: Vec<(u32, u16)>,
    /// Per withdrawal slot, whether it went through (public).
    pub withdrawn: Vec<bool>,
}

impl<M: Matcher> Batcher<M> {
    /// Runs the matcher once per group of `DEFAULT_MARKETS` open markets, padded with 0,
    /// so every window runs the same circuit whichever markets have orders (and at least
    /// once, for credits and withdrawals). `first`'s credits and withdrawals go in the
    /// first run only; its `markets` are ignored.
    pub(super) async fn clear(
        &self,
        links: &Links,
        markets: &[u32],
        first: Public,
        shares: Shares<'_>,
    ) -> Result<Cleared> {
        let mut passes: Vec<Vec<u32>> = markets
            .chunks(DEFAULT_MARKETS)
            .map(<[u32]>::to_vec)
            .collect();
        if passes.is_empty() {
            passes.push(Vec::new());
        }
        passes.iter_mut().for_each(|p| p.resize(DEFAULT_MARKETS, 0));
        let idle = Public {
            markets: vec![],
            credits: vec![0; first.credits.len()],
            withdrawals: vec![0; first.withdrawals.len()],
        };
        let no_accounts = vec![[0u8; 8]; first.withdrawals.len()];
        let mut done = Cleared {
            fills: vec![[0u8; FILL_LEN]; shares.orders.len()],
            ..Cleared::default()
        };
        let mut table = shares.accounts.to_vec();
        for (k, group) in passes.into_iter().enumerate() {
            let base = if k == 0 { &first } else { &idle };
            let public = Public {
                markets: group.clone(),
                ..base.clone()
            };
            let mine = Shares {
                orders: shares.orders,
                accounts: &table,
                withdrawals: if k == 0 {
                    shares.withdrawals
                } else {
                    &no_accounts
                },
            };
            let out = self.matcher.clear(links, &public, &mine).await?;
            if out.fills.len() < shares.orders.len() || out.balances.len() < table.len() {
                return Err(Error::Mpc("matcher returned too few shares".into()));
            }
            (done.fills.iter_mut().zip(out.fills))
                .for_each(|(a, b)| a.iter_mut().zip(b).for_each(|(x, y)| *x ^= y));
            (table.iter_mut().zip(&out.balances)).for_each(|(row, b)| row[8..].copy_from_slice(b));
            let priced = group.into_iter().zip(out.prices).filter(|(m, _)| *m != 0);
            done.prices
                .extend(priced.filter_map(|(m, p)| p.map(|p| (m, p))));
            if k == 0 {
                done.withdrawn = out.withdrawn;
            }
        }
        done.balances = table
            .iter()
            .map(|r| r[8..].try_into().expect("8 bytes"))
            .collect();
        Ok(done)
    }
}
