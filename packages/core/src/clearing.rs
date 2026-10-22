//! The clearing rule: YES/NO crossing at the midpoint. The MPC circuit must match it.

use crate::TICKS;
use crate::order::{Order, Side};

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

/// The batch's public clearing price in YES half-ticks (2..=198): the volume-weighted
/// mean of every fill's `yes_cost`, rounded down. `None` if nothing crossed. All three
/// relayers learn it (for `lastPrice`/`history`); sizes and counts stay hidden.
pub fn clearing_price(fills: &[Fill]) -> Option<u16> {
    let volume: u64 = fills.iter().map(|f| f.size as u64).sum();
    let cost: u64 = fills
        .iter()
        .map(|f| f.size as u64 * f.yes_cost as u64)
        .sum();
    (volume > 0).then(|| (cost / volume) as u16)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::order::test_order as o;

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
        // 2 at 120 and 3 at 105: (240 + 315) / 5 = 111.
        assert_eq!(clearing_price(&f), Some(111));
        assert_eq!(clearing_price(&[]), None);
    }
}
