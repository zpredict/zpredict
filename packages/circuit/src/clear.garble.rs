// Batch clearing for zPredict; mirrors `zpredict_core::clear`. See the crate docs.

pub fn main(
    a: ([[u8; 18]; 16], [[u8; 10]; 16]),
    b: ([[u8; 18]; 16], [[u8; 10]; 16]),
    c: ([[u8; 18]; 16], [[u8; 10]; 16]),
) -> [[u8; 10]; 16] {
    // Rebuild and decode. Malformed orders (side > 1, price outside 1..=99, size > MAX_SIZE) become dummies.
    let mut yes = [false; 16];
    let mut price = [0u8; 16];
    let mut size = [0u32; 16];
    for i in 0usize..16usize {
        let mut o = [0u8; 18];
        for k in 0usize..18usize {
            o[k] = a.0[i][k] ^ b.0[i][k] ^ c.0[i][k];
        }
        let s = (o[6] as u32)
            | ((o[7] as u32) << 8u8)
            | ((o[8] as u32) << 16u8)
            | ((o[9] as u32) << 24u8);
        let ok = (o[4] <= 1u8) & (o[5] >= 1u8) & (o[5] <= 99u8) & (s <= 1000000u32);
        yes[i] = o[4] == 0u8;
        price[i] = o[5];
        size[i] = if ok { s } else { 0u32 };
    }

    // Each order's place in its side's queue (best price first, ties by index), as an
    // interval [start, end) on that side's cumulative size axis.
    let mut start = [0u32; 16];
    let mut end = [0u32; 16];
    for i in 0usize..16usize {
        let mut acc = 0u32;
        for k in 0usize..16usize {
            if k != i {
                let ahead = if k < i { price[k] >= price[i] } else { price[k] > price[i] };
                if (yes[k] == yes[i]) & ahead {
                    acc = acc + size[k];
                }
            }
        }
        start[i] = acc;
        end[i] = acc + size[i];
    }

    // A YES/NO pair fills by the overlap of their intervals, if their prices cross.
    let mut filled = [0u32; 16];
    let mut cost = [0u32; 16];
    for i in 0usize..16usize {
        for j in 0usize..16usize {
            if j > i {
                let lo = if start[i] > start[j] { start[i] } else { start[j] };
                let hi = if end[i] < end[j] { end[i] } else { end[j] };
                let p = if yes[i] { price[i] as u16 } else { price[j] as u16 };
                let q = if yes[i] { price[j] as u16 } else { price[i] as u16 };
                // Branch-free: an `if` around array writes makes Garble mux whole arrays.
                let cross = (yes[i] != yes[j]) & (p + q >= 100u16) & (hi > lo);
                let f = if cross { hi - lo } else { 0u32 };
                // f * yes_cost by shift-and-add: the cost fits in 8 bits, and Garble's
                // generic u32 multiplier costs ~4x more AND gates.
                let c = (p + 100u16 - q) as u8;
                let mut yc = 0u32;
                for b in 0usize..8usize {
                    if ((c >> (b as u8)) & 1u8) == 1u8 {
                        yc = yc + (f << (b as u8));
                    }
                }
                let nc = (f << 7u8) + (f << 6u8) + (f << 3u8) - yc;
                filled[i] = filled[i] + f;
                filled[j] = filled[j] + f;
                cost[i] = cost[i] + if yes[i] { yc } else { nc };
                cost[j] = cost[j] + if yes[i] { nc } else { yc };
            }
        }
    }

    // Fill record (zpredict_core::fill_records): size u32 LE | total cost u32 LE (half-ticks)
    // | side u8 | flags u8 (bit0 = filled); all zero when unfilled. Masked by all three parties.
    let mut out = [[0u8; 10]; 16];
    for i in 0usize..16usize {
        let mut r = [0u8; 10];
        for k in 0usize..4usize {
            r[k] = (filled[i] >> ((8usize * k) as u8)) as u8;
            r[k + 4usize] = (cost[i] >> ((8usize * k) as u8)) as u8;
        }
        if filled[i] > 0u32 {
            r[8] = if yes[i] { 0u8 } else { 1u8 };
            r[9] = 1u8;
        }
        for k in 0usize..10usize {
            out[i][k] = r[k] ^ a.1[i][k] ^ b.1[i][k] ^ c.1[i][k];
        }
    }
    out
}
