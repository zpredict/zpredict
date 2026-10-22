//! Paying a resolved market's winners into the balance table, inside MPC.
//!
//! Runs instead of clearing in the window where all three relayers' own nodes agree a
//! market resolved, and with which outcome. Every position goes through the resolution
//! program, `DEFAULT_POSITIONS` at a time, so nobody learns which positions were in that
//! market or won. Each market pays exactly once: the `Resolved` event records it.

use zpredict_circuit::{DEFAULT_POSITIONS, Position};
use zpredict_core::{FILL_LEN, ORDER_LEN, Side};

use super::Batcher;
use crate::error::Result;
use crate::mpc::Matcher;
use crate::peers::Links;
use crate::store::Event;

impl<M: Matcher> Batcher<M> {
    /// Pays `market` (resolved to `outcome`: 0 = YES, 1 = NO) over the first `n` rows.
    pub(super) async fn resolve(
        &self,
        links: &Links,
        market: u32,
        outcome: u8,
        n: usize,
    ) -> Result<()> {
        let side = if outcome == 0 { Side::Yes } else { Side::No };
        let (positions, mut table) = {
            let mut s = self.state.lock().expect("state lock");
            if links.party == 0 {
                s.record(Event::Seal { rows: n })?;
            }
            (s.positions(), s.table.shares(n, self.rows))
        };
        let empty: Position = ([0; ORDER_LEN], [0; FILL_LEN]);
        let mut chunks: Vec<Vec<Position>> = positions
            .chunks(DEFAULT_POSITIONS)
            .map(<[_]>::to_vec)
            .collect();
        chunks
            .iter_mut()
            .for_each(|c| c.resize(DEFAULT_POSITIONS, empty));
        for chunk in &chunks {
            let balances = (self.matcher)
                .resolve(links, market, side, chunk, &table)
                .await?;
            (table.iter_mut().zip(&balances)).for_each(|(row, b)| row[8..].copy_from_slice(b));
        }
        let balances = table.iter().take(n).map(|r| hex::encode(&r[8..])).collect();
        let mut s = self.state.lock().expect("state lock");
        s.record(Event::Resolved { market, balances })
    }
}
