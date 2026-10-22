//! Seeded clearing batches and what the clearing circuit must output for them.

use zpredict_core::{
    ACCOUNT_LEN, Account, MAX_SIZE, ORDER_LEN, Order, Side, Withdrawal, apply_flows,
    clear_with_balances, fill_records,
};

use super::{Rng, decoded, localhost, split3};
use crate::{DEFAULT_WITHDRAWALS, Error, Outcome, Public, Shares, run_party};

/// The markets every generated batch clears (two used slots, two unused); a few orders
/// are for [`UNLISTED`], which the batch does not clear.
pub const MARKETS: [u32; 4] = [7, 8, 0, 0];
pub const UNLISTED: u32 = 9;

/// A batch of encoded orders, the balance table, and the three relayers' shares of both.
pub struct Batch {
    pub orders: Vec<[u8; ORDER_LEN]>,
    pub accounts: Vec<Account>,
    /// [`MARKETS`], public credits per row and withdrawal amounts per slot.
    pub public: Public,
    /// The withdrawals in the clear (their amounts are in `public`).
    pub withdrawals: Vec<Withdrawal>,
    pub order_shares: [Vec<[u8; ORDER_LEN]>; 3],
    pub account_shares: [Vec<[u8; ACCOUNT_LEN]>; 3],
    pub withdrawal_shares: [Vec<[u8; 8]>; 3],
}

impl Batch {
    /// Party `p`'s secret-shared inputs.
    pub fn shares(&self, p: usize) -> Shares<'_> {
        Shares {
            orders: &self.order_shares[p],
            accounts: &self.account_shares[p],
            withdrawals: &self.withdrawal_shares[p],
        }
    }
}

/// Random [`MARKETS`] batch of `slots` orders over a `rows`-row table (at least 4), with
/// dummies, malformed slots, orders in two markets plus unlisted ones, price ties,
/// partial fills, the odd `MAX_SIZE` order, short and unknown accounts, accounts with
/// several orders, a duplicated row id, zero padding rows, deposits and withdrawals that
/// fit or don't, so every branch gets exercised.
pub fn random_batch(rng: &mut Rng, slots: usize, rows: usize) -> Batch {
    let used = 4 + rng.below(rows.min(16) as u64 - 3) as usize; // the rest is padding
    let mut accounts = vec![Account { id: 0, balance: 0 }; rows];
    for a in accounts.iter_mut().take(used) {
        a.id = 1 + rng.below(1 << 40);
        a.balance = match rng.below(8) {
            0 => 0,
            1 => 1 << 40, // covers even MAX_SIZE orders
            _ => rng.below(6000),
        };
    }
    accounts[used - 1].id = accounts[0].id; // duplicate: the first row must win
    // Spread the live rows over the table so high row indices get exercised too.
    for k in 0..used {
        let j = rng.below(rows as u64) as usize;
        accounts.swap(k, j);
    }
    let live: Vec<u64> = accounts
        .iter()
        .filter(|a| a.id != 0)
        .map(|a| a.id)
        .collect();
    let orders: Vec<[u8; ORDER_LEN]> = (0..slots)
        .map(|_| {
            let side = if rng.below(2) == 0 {
                Side::Yes
            } else {
                Side::No
            };
            let price = match rng.below(3) {
                0 => 40 + rng.below(21) as u8, // tight band: many ties and crosses
                _ => 1 + rng.below(99) as u8,
            };
            let size = match rng.below(10) {
                0 => 0,
                1 => MAX_SIZE - rng.below(3) as u32,
                _ => 1 + rng.below(20) as u32,
            };
            let account = match rng.below(8) {
                0 => rng.next_u64(), // no such account
                _ => live[rng.below(live.len() as u64) as usize],
            };
            let market = match rng.below(10) {
                0 => UNLISTED,
                1..=5 => MARKETS[0],
                _ => MARKETS[1],
            };
            let mut b = Order {
                market,
                side,
                price,
                size,
                account,
            }
            .encode();
            match rng.below(16) {
                0 => b[4] = 2 + rng.below(254) as u8,             // bad side
                1 => b[5] = [0, 100, 255][rng.below(3) as usize], // bad price
                2 => b[6..10].copy_from_slice(&(MAX_SIZE + 1).to_le_bytes()), // too big
                _ => {}
            }
            b
        })
        .collect();
    let credits = accounts
        .iter()
        .map(|a| match (a.id, rng.below(4)) {
            (0, _) | (_, 1..) => 0,
            _ => rng.below(3000), // a deposit: may fund an order that couldn't afford it
        })
        .collect();
    // Unused slots, withdrawals that fit some balances and not others, an account with
    // two in one batch, and accounts with no row.
    let withdrawals: Vec<Withdrawal> = (0..DEFAULT_WITHDRAWALS)
        .map(|_| match rng.below(6) {
            0 | 1 => Withdrawal {
                account: 0,
                amount: 0,
            },
            2 => Withdrawal {
                account: rng.next_u64(),
                amount: 1 + rng.below(100),
            },
            _ => Withdrawal {
                account: live[rng.below(live.len() as u64) as usize],
                amount: 1 + rng.below(5000),
            },
        })
        .collect();
    let rows: Vec<[u8; ACCOUNT_LEN]> = accounts.iter().map(Account::encode).collect();
    let ids: Vec<[u8; 8]> = withdrawals
        .iter()
        .map(|w| w.account.to_le_bytes())
        .collect();
    Batch {
        public: Public {
            markets: MARKETS.to_vec(),
            credits,
            withdrawals: withdrawals.iter().map(|w| w.amount).collect(),
        },
        order_shares: split3(rng, &orders),
        account_shares: split3(rng, &rows),
        withdrawal_shares: split3(rng, &ids),
        withdrawals,
        orders,
        accounts,
    }
}

/// What the circuit must output for a batch: `apply_flows` (credits, withdrawals), then
/// `clear_with_balances`, as fill records, LE balances, prices and which withdrawals
/// went through, with every slot that fails `Order::decode` treated as a size-0 dummy.
pub fn expected(b: &Batch) -> Outcome {
    let batch = decoded(&b.orders);
    let (table, withdrawn) = apply_flows(&b.accounts, &b.public.credits, &b.withdrawals);
    let c = clear_with_balances(&b.public.markets, &batch, &table);
    Outcome {
        fills: fill_records(&batch, &c.fills),
        balances: c.balances.iter().map(|v| v.to_le_bytes()).collect(),
        prices: c.prices,
        withdrawn,
    }
}

/// XOR the three relayers' shares back together.
pub fn combine(shares: &[Outcome; 3]) -> Outcome {
    shares[0].xor(&shares[1]).xor(&shares[2])
}

/// Runs all three parties concurrently in this task over localhost TCP.
pub async fn run_local(batch: &Batch, base_port: u16) -> Result<[Outcome; 3], Error> {
    let peers = localhost(base_port);
    let (s0, s1, s2) = (batch.shares(0), batch.shares(1), batch.shares(2));
    let (a, b, c) = tokio::join!(
        run_party(0, &peers, &batch.public, &s0),
        run_party(1, &peers, &batch.public, &s1),
        run_party(2, &peers, &batch.public, &s2),
    );
    Ok([a?, b?, c?])
}
