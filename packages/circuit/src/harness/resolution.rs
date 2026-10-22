//! Seeded resolutions and what the resolution circuit must output for them.

use zpredict_core::{ACCOUNT_LEN, Account, BALANCE_LEN, FILL_LEN, Key, ORDER_LEN, Side, resolve};

use super::{MARKETS, Rng, UNLISTED, decoded, expected, random_batch, split3};
use crate::resolve::{Position, Table};

/// A market resolving over positions from a cleared batch.
pub struct Resolution {
    pub market: u32,
    pub outcome: Side,
    /// The positions in the clear: encoded orders and their combined fill records.
    pub orders: Vec<[u8; ORDER_LEN]>,
    pub records: Vec<[u8; FILL_LEN]>,
    pub accounts: Vec<Account>,
    pub position_shares: [Vec<Position>; 3],
    pub account_shares: [Vec<[u8; ACCOUNT_LEN]>; 3],
    pub key_shares: [Vec<Key>; 3],
}

impl Resolution {
    /// Party `p`'s shares of the table.
    pub fn table(&self, p: usize) -> Table<'_> {
        (&self.account_shares[p], &self.key_shares[p])
    }
}

/// `positions` positions from one random batch, cleared by the reference, over the
/// batch's table as it stands afterwards; the market is one of the batch's two, or one
/// it never listed, and the outcome is random.
pub fn random_resolution(rng: &mut Rng, positions: usize, rows: usize) -> Resolution {
    let batch = random_batch(rng, positions, rows);
    let after = expected(&batch);
    let accounts: Vec<Account> = (batch.accounts.iter().zip(&after.balances))
        .map(|(a, b)| Account {
            balance: u64::from_le_bytes(*b),
            ..*a
        })
        .collect();
    let market = [MARKETS[0], MARKETS[1], MARKETS[0], UNLISTED][rng.below(4) as usize];
    let outcome = if rng.below(2) == 0 {
        Side::Yes
    } else {
        Side::No
    };
    let orders = batch.orders;
    let records = after.fills;
    let order_shares = split3(rng, &orders);
    let record_shares = split3(rng, &records);
    let rows_plain: Vec<[u8; ACCOUNT_LEN]> = accounts.iter().map(Account::encode).collect();
    Resolution {
        market,
        outcome,
        position_shares: std::array::from_fn(|p| {
            (order_shares[p].iter().copied())
                .zip(record_shares[p].iter().copied())
                .collect()
        }),
        account_shares: split3(rng, &rows_plain),
        key_shares: batch.key_shares,
        orders,
        records,
        accounts,
    }
}

/// `zpredict_core::resolve` on the positions in the clear, as LE balances.
pub fn expected_resolution(r: &Resolution) -> Vec<[u8; BALANCE_LEN]> {
    let positions: Vec<_> = decoded(&r.orders)
        .into_iter()
        .zip(r.records.clone())
        .collect();
    let balances = resolve(r.market, r.outcome, &positions, &r.accounts);
    balances.iter().map(|b| b.to_le_bytes()).collect()
}
