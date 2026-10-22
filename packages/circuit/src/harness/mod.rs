//! Local 3-party harness: seeded batches and resolutions, the expected results, and
//! localhost runs. Test and benchmark support only; nothing here is safe for real orders.

use std::net::{Ipv4Addr, SocketAddr};

use zpredict_core::{Order, Side};

mod batch;
mod resolution;

pub use batch::{Batch, MARKETS, UNLISTED, combine, expected, random_batch, run_local};
pub use resolution::{Resolution, expected_resolution, random_resolution};

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

/// Encoded orders as the circuit sees them: anything `Order::decode` rejects is a
/// size-0 dummy.
fn decoded(orders: &[[u8; zpredict_core::ORDER_LEN]]) -> Vec<Order> {
    let dummy = Order {
        market: 0,
        side: Side::Yes,
        price: 1,
        size: 0,
        key: [0; 16],
    };
    let decode = |o| Order::decode(o).unwrap_or(dummy);
    orders.iter().map(decode).collect()
}

/// `127.0.0.1:base`, `base + 1`, `base + 2`.
pub fn localhost(base: u16) -> [SocketAddr; 3] {
    std::array::from_fn(|p| (Ipv4Addr::LOCALHOST, base + p as u16).into())
}
