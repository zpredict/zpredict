//! Per-order fill records: what each owner learns after a batch.

use crate::FILL_LEN;
use crate::clearing::Fill;
use crate::order::Order;

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
    use crate::clearing::clear;
    use crate::order::Side;
    use crate::order::test_order as o;

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
}
