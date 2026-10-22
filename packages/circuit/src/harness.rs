//! Local 3-party harness: seeded batches, the expected result, and a localhost run.
//! Test and benchmark support only; nothing here is safe for real orders.

use std::net::{Ipv4Addr, SocketAddr};

use zpredict_core::{FILL_LEN, MAX_SIZE, ORDER_LEN, Order, Side, clear, fill_records, split};

use crate::{Error, FillShares, N, OrderShares, run_party};

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

/// A batch of encoded orders and its three relayers' shares.
pub struct Batch {
    pub orders: [[u8; ORDER_LEN]; N],
    pub shares: [OrderShares; 3],
}

/// Random batch with dummies, malformed slots, price ties, partial fills and the odd
/// `MAX_SIZE` order, so every branch of `clear` gets exercised.
pub fn random_batch(rng: &mut Rng) -> Batch {
    let orders: [[u8; ORDER_LEN]; N] = std::array::from_fn(|_| {
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
        let mut b = Order {
            market: 7,
            side,
            price,
            size,
            account: rng.next_u64(),
        }
        .encode();
        match rng.below(16) {
            0 => b[4] = 2 + rng.below(254) as u8,             // bad side
            1 => b[5] = [0, 100, 255][rng.below(3) as usize], // bad price
            2 => b[6..10].copy_from_slice(&(MAX_SIZE + 1).to_le_bytes()), // too big
            _ => {}
        }
        b
    });
    let mut shares = [[[0u8; ORDER_LEN]; N]; 3];
    for (i, o) in orders.iter().enumerate() {
        let s = split(o, rng.bytes(), rng.bytes());
        for p in 0..3 {
            shares[p][i] = s[p];
        }
    }
    Batch { orders, shares }
}

/// What the circuit must output: `fill_records(batch, &clear(batch))`, with every slot
/// that fails `Order::decode` treated as a size-0 dummy.
pub fn expected(orders: &[[u8; ORDER_LEN]; N]) -> FillShares {
    let dummy = Order {
        market: 0,
        side: Side::Yes,
        price: 1,
        size: 0,
        account: 0,
    };
    let batch: Vec<Order> = orders
        .iter()
        .map(|b| Order::decode(b).unwrap_or(dummy))
        .collect();
    let mut out = [[0u8; FILL_LEN]; N];
    out.copy_from_slice(&fill_records(&batch, &clear(&batch)));
    out
}

/// XOR the three relayers' fill shares back into records.
pub fn combine(shares: &[FillShares; 3]) -> FillShares {
    std::array::from_fn(|i| {
        std::array::from_fn(|k| shares[0][i][k] ^ shares[1][i][k] ^ shares[2][i][k])
    })
}

/// `127.0.0.1:base`, `base + 1`, `base + 2`.
pub fn localhost(base: u16) -> [SocketAddr; 3] {
    std::array::from_fn(|p| (Ipv4Addr::LOCALHOST, base + p as u16).into())
}

/// Runs all three parties concurrently in this task over localhost TCP.
pub async fn run_local(
    shares: &[OrderShares; 3],
    base_port: u16,
) -> Result<[FillShares; 3], Error> {
    let peers = localhost(base_port);
    let (a, b, c) = tokio::join!(
        run_party(0, &peers, &shares[0]),
        run_party(1, &peers, &shares[1]),
        run_party(2, &peers, &shares[2]),
    );
    Ok([a?, b?, c?])
}
