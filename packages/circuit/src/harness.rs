//! Local 3-party harness: seeded batches, the expected result, and a localhost run.
//! Test and benchmark support only; nothing here is safe for real orders.

use std::net::{Ipv4Addr, SocketAddr};

use zpredict_core::{
    ACCOUNT_LEN, Account, MAX_SIZE, ORDER_LEN, Order, Side, clear_with_balances, fill_records,
};

use crate::{Error, N, Outcome, run_party};

/// The market every generated batch clears; a few orders are for [`OTHER_MARKET`].
pub const MARKET: u32 = 7;
pub const OTHER_MARKET: u32 = 8;

/// SplitMix64: deterministic, so a failing seed reproduces. Not a CSPRNG.
pub struct Rng(pub u64);

impl Rng {
    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    fn below(&mut self, n: u64) -> u64 {
        self.next_u64() % n
    }

    fn bytes<const L: usize>(&mut self) -> [u8; L] {
        std::array::from_fn(|_| self.next_u64() as u8)
    }
}

/// A batch of encoded orders, the balance table, and the three relayers' shares of both.
pub struct Batch {
    pub orders: Vec<[u8; ORDER_LEN]>,
    pub accounts: Vec<Account>,
    pub order_shares: [Vec<[u8; ORDER_LEN]>; 3],
    pub account_shares: [Vec<[u8; ACCOUNT_LEN]>; 3],
}

/// Random [`MARKET`] batch over a `rows`-row table (at least 4), with dummies, malformed
/// slots, other-market orders, price ties, partial fills, the odd `MAX_SIZE` order,
/// short and unknown accounts, accounts with several orders, a duplicated row id and
/// zero padding rows, so every branch gets exercised.
pub fn random_batch(rng: &mut Rng, rows: usize) -> Batch {
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
    let orders: Vec<[u8; ORDER_LEN]> = (0..N)
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
            let market = if rng.below(10) == 0 {
                OTHER_MARKET
            } else {
                MARKET
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
    let rows: Vec<[u8; ACCOUNT_LEN]> = accounts.iter().map(Account::encode).collect();
    Batch {
        order_shares: split3(rng, &orders),
        account_shares: split3(rng, &rows),
        orders,
        accounts,
    }
}

/// XOR-split every row three ways: `[r0, r1, row ^ r0 ^ r1]`.
fn split3<const L: usize>(rng: &mut Rng, rows: &[[u8; L]]) -> [Vec<[u8; L]>; 3] {
    let mut out = [vec![], vec![], vec![]];
    for row in rows {
        let (r0, r1): ([u8; L], [u8; L]) = (rng.bytes(), rng.bytes());
        out[0].push(r0);
        out[1].push(r1);
        out[2].push(std::array::from_fn(|k| row[k] ^ r0[k] ^ r1[k]));
    }
    out
}

/// What the circuit must output for a [`MARKET`] batch: `clear_with_balances` as fill
/// records, LE balances and the price, with every slot that fails `Order::decode`
/// treated as a size-0 dummy.
pub fn expected(b: &Batch) -> Outcome {
    let dummy = Order {
        market: MARKET,
        side: Side::Yes,
        price: 1,
        size: 0,
        account: 0,
    };
    let batch: Vec<Order> = b
        .orders
        .iter()
        .map(|o| Order::decode(o).unwrap_or(dummy))
        .collect();
    let c = clear_with_balances(MARKET, &batch, &b.accounts);
    Outcome {
        fills: fill_records(&batch, &c.fills),
        balances: c.balances.iter().map(|v| v.to_le_bytes()).collect(),
        price: c.price,
    }
}

/// XOR the three relayers' shares back together.
pub fn combine(shares: &[Outcome; 3]) -> Outcome {
    shares[0].xor(&shares[1]).xor(&shares[2])
}

/// `127.0.0.1:base`, `base + 1`, `base + 2`.
pub fn localhost(base: u16) -> [SocketAddr; 3] {
    std::array::from_fn(|p| (Ipv4Addr::LOCALHOST, base + p as u16).into())
}

/// Runs all three parties concurrently in this task over localhost TCP.
pub async fn run_local(batch: &Batch, base_port: u16) -> Result<[Outcome; 3], Error> {
    let peers = localhost(base_port);
    let party = |p: usize| {
        let (orders, accounts) = (&batch.order_shares[p], &batch.account_shares[p]);
        run_party(p, &peers, MARKET, orders, accounts)
    };
    let (a, b, c) = tokio::join!(party(0), party(1), party(2));
    Ok([a?, b?, c?])
}
