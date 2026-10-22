//! Order encoding, XOR secret shares, and the plaintext clearing rule.
//!
//! The browser splits each encoded order into three XOR shares, one per relayer.
//! The MPC circuit rebuilds the orders and runs [`clear`]; this module is the
//! reference that circuit is tested against, so the two must agree bit for bit.

/// Prices are in ticks of 1/100 of a unit: a YES bid at 63 pays up to 0.63.
pub const TICKS: u16 = 100;
/// Encoded order length in bytes; also the share length.
pub const ORDER_LEN: usize = 18;
/// Per-order fill record length; also the fill share length.
pub const FILL_LEN: usize = 10;
/// Largest order size accepted, so a fill's total cost always fits in its u32 field.
pub const MAX_SIZE: u32 = 1_000_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Yes = 0,
    No = 1,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Order {
    pub market: u32,
    pub side: Side,
    /// 1..=99 ticks: the most this order pays per contract for its side.
    pub price: u8,
    /// Contracts, at most [`MAX_SIZE`]; 0 marks a dummy order used to pad a batch.
    pub size: u32,
    pub account: u64,
}

impl Order {
    /// Little-endian layout: market(4) side(1) price(1) size(4) account(8).
    /// The browser must produce exactly these bytes.
    pub fn encode(&self) -> [u8; ORDER_LEN] {
        let mut b = [0u8; ORDER_LEN];
        b[0..4].copy_from_slice(&self.market.to_le_bytes());
        b[4] = self.side as u8;
        b[5] = self.price;
        b[6..10].copy_from_slice(&self.size.to_le_bytes());
        b[10..18].copy_from_slice(&self.account.to_le_bytes());
        b
    }

    /// Rejects anything the circuit would treat as malformed.
    pub fn decode(b: &[u8; ORDER_LEN]) -> Option<Self> {
        let side = match b[4] {
            0 => Side::Yes,
            1 => Side::No,
            _ => return None,
        };
        let price = b[5];
        let size = u32::from_le_bytes(b[6..10].try_into().unwrap());
        if price == 0 || price as u16 >= TICKS || size > MAX_SIZE {
            return None;
        }
        Some(Self {
            market: u32::from_le_bytes(b[0..4].try_into().unwrap()),
            side,
            price,
            size,
            account: u64::from_le_bytes(b[10..18].try_into().unwrap()),
        })
    }
}

/// Split with caller-supplied randomness: `r0`, `r1` must be uniformly random.
pub fn split(
    order: &[u8; ORDER_LEN],
    r0: [u8; ORDER_LEN],
    r1: [u8; ORDER_LEN],
) -> [[u8; ORDER_LEN]; 3] {
    let mut s2 = *order;
    for i in 0..ORDER_LEN {
        s2[i] ^= r0[i] ^ r1[i];
    }
    [r0, r1, s2]
}

pub fn combine(shares: &[[u8; ORDER_LEN]; 3]) -> [u8; ORDER_LEN] {
    let mut b = [0u8; ORDER_LEN];
    for s in shares {
        for i in 0..ORDER_LEN {
            b[i] ^= s[i];
        }
    }
    b
}

/// One matched pair. Costs are in half-ticks (1/200 of a unit) so the midpoint is exact;
/// `yes_cost + no_cost == 2 * TICKS`, i.e. each contract locks exactly one unit.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fill {
    pub yes: usize,
    pub no: usize,
    pub size: u32,
    pub yes_cost: u16,
    pub no_cost: u16,
}

/// Cross YES against NO within one market's batch.
///
/// A YES bid `p` and a NO bid `q` cross when `p + q >= 100`; the fill is priced at the
/// midpoint of YES's bid and NO's implied YES ask (`100 - q`). Best prices go first,
/// ties by batch position, partial fills carry over. Indices refer to `batch`.
pub fn clear(batch: &[Order]) -> Vec<Fill> {
    let pick = |side: Side| {
        let mut ix: Vec<usize> = (0..batch.len())
            .filter(|&i| batch[i].side == side && batch[i].size > 0)
            .collect();
        ix.sort_by_key(|&i| (std::cmp::Reverse(batch[i].price), i));
        ix
    };
    let (yes, no) = (pick(Side::Yes), pick(Side::No));
    let mut left: Vec<u32> = batch.iter().map(|o| o.size).collect();
    let mut fills = Vec::new();
    let (mut y, mut n) = (0, 0);
    while y < yes.len() && n < no.len() {
        let (yi, ni) = (yes[y], no[n]);
        let (p, q) = (batch[yi].price as u16, batch[ni].price as u16);
        if p + q < TICKS {
            break; // sorted best-first, so nothing further can cross
        }
        let size = left[yi].min(left[ni]);
        let yes_cost = p + TICKS - q;
        fills.push(Fill {
            yes: yi,
            no: ni,
            size,
            yes_cost,
            no_cost: 2 * TICKS - yes_cost,
        });
        left[yi] -= size;
        left[ni] -= size;
        if left[yi] == 0 {
            y += 1;
        }
        if left[ni] == 0 {
            n += 1;
        }
    }
    fills
}

/// One record per batch slot, in batch order: `size u32 LE | total_cost u32 LE | side u8 | flags u8`.
///
/// Size and cost (half-ticks) are summed over every match the order took part in, since one
/// order can cross several counterparties at different midpoints. `flags` bit 0 = filled.
/// Unfilled and dummy slots are all zero. The circuit outputs these as XOR shares.
pub fn fill_records(batch: &[Order], fills: &[Fill]) -> Vec<[u8; FILL_LEN]> {
    let mut size = vec![0u32; batch.len()];
    let mut cost = vec![0u32; batch.len()];
    for f in fills {
        size[f.yes] += f.size;
        cost[f.yes] += f.size * f.yes_cost as u32;
        size[f.no] += f.size;
        cost[f.no] += f.size * f.no_cost as u32;
    }
    batch
        .iter()
        .enumerate()
        .map(|(i, o)| {
            let mut r = [0u8; FILL_LEN];
            if size[i] > 0 {
                r[0..4].copy_from_slice(&size[i].to_le_bytes());
                r[4..8].copy_from_slice(&cost[i].to_le_bytes());
                r[8] = o.side as u8;
                r[9] = 1;
            }
            r
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn o(side: Side, price: u8, size: u32) -> Order {
        Order {
            market: 7,
            side,
            price,
            size,
            account: 42,
        }
    }

    #[test]
    fn encode_roundtrip_and_shares() {
        let ord = o(Side::No, 37, 5);
        let b = ord.encode();
        let shares = split(&b, [0xA5; ORDER_LEN], [0x3C; ORDER_LEN]);
        assert_ne!(shares[2], b, "no single share equals the order");
        assert_eq!(Order::decode(&combine(&shares)), Some(ord));
    }

    #[test]
    fn decode_rejects_bad_side_and_price() {
        let mut b = o(Side::Yes, 50, 1).encode();
        b[4] = 2;
        assert_eq!(Order::decode(&b), None);
        let mut b = o(Side::Yes, 50, 1).encode();
        b[5] = 100;
        assert_eq!(Order::decode(&b), None);
        assert_eq!(
            Order::decode(&o(Side::Yes, 50, MAX_SIZE + 1).encode()),
            None
        );
    }

    #[test]
    fn fill_records_sum_over_matches() {
        // NO 5 @ 50 crosses YES 2 @ 70 (cost 120 each) then YES 3 of 4 @ 55 (cost 105 each).
        let batch = [
            o(Side::Yes, 55, 4),
            o(Side::Yes, 70, 2),
            o(Side::No, 50, 5),
            o(Side::No, 99, 0),
        ];
        let r = fill_records(&batch, &clear(&batch));
        let rec = |size: u32, cost: u32, side: u8| {
            let mut b = [0u8; FILL_LEN];
            b[0..4].copy_from_slice(&size.to_le_bytes());
            b[4..8].copy_from_slice(&cost.to_le_bytes());
            b[8] = side;
            b[9] = 1;
            b
        };
        assert_eq!(r[0], rec(3, 3 * 105, 0));
        assert_eq!(r[1], rec(2, 2 * 120, 0));
        assert_eq!(r[2], rec(5, 2 * 80 + 3 * 95, 1));
        assert_eq!(r[3], [0u8; FILL_LEN], "dummy stays zero");
    }

    #[test]
    fn crosses_at_midpoint() {
        // YES pays up to 0.60, NO pays up to 0.45 (YES ask 0.55) → midpoint 0.575.
        let f = clear(&[o(Side::Yes, 60, 3), o(Side::No, 45, 3)]);
        assert_eq!(
            f,
            vec![Fill {
                yes: 0,
                no: 1,
                size: 3,
                yes_cost: 115,
                no_cost: 85
            }]
        );
    }

    #[test]
    fn no_cross_below_one_unit() {
        assert!(clear(&[o(Side::Yes, 40, 1), o(Side::No, 59, 1)]).is_empty());
    }

    #[test]
    fn best_price_first_partial_fills_and_dummies() {
        let batch = [
            o(Side::Yes, 55, 4),
            o(Side::Yes, 70, 2),
            o(Side::No, 50, 5),
            o(Side::No, 99, 0), // dummy padding: never fills
        ];
        let f = clear(&batch);
        assert_eq!(f.len(), 2);
        assert_eq!((f[0].yes, f[0].size), (1, 2)); // 70 beats 55
        assert_eq!((f[1].yes, f[1].size), (0, 3)); // NO's remaining 3
        assert!(f.iter().all(|x| x.yes_cost + x.no_cost == 2 * TICKS));
    }
}
