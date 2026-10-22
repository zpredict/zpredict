// Batch clearing for zPredict; mirrors `zpredict_core::clear_with_balances`. See the crate docs.
// 16 order slots, 16 balance-table rows. Garble ranges must be literals, hence no consts.

// Fields in alphabetical order: that is how Garble lays out struct inputs (io.rs too).
struct Party {
    accounts: [[u8; 16]; 16],
    balance_mask: [[u8; 8]; 16],
    fill_mask: [[u8; 10]; 16],
    orders: [[u8; 18]; 16],
}

pub fn main(p0: Party, p1: Party, p2: Party) -> ([[u8; 10]; 16], [[u8; 8]; 16]) {
    // Rebuild and decode. Malformed orders (side > 1, price outside 1..=99, size > MAX_SIZE) become dummies.
    let mut yes = [false; 16];
    let mut price = [0u8; 16];
    let mut size = [0u32; 16];
    let mut account = [0u64; 16];
    for i in 0usize..16usize {
        let mut o = [0u8; 18];
        for k in 0usize..18usize {
            o[k] = p0.orders[i][k] ^ p1.orders[i][k] ^ p2.orders[i][k];
        }
        let s = (o[6] as u32)
            | ((o[7] as u32) << 8u8)
            | ((o[8] as u32) << 16u8)
            | ((o[9] as u32) << 24u8);
        let ok = (o[4] <= 1u8) & (o[5] >= 1u8) & (o[5] <= 99u8) & (s <= 1000000u32);
        yes[i] = o[4] == 0u8;
        price[i] = o[5];
        size[i] = if ok { s } else { 0u32 };
        for k in 0usize..8usize {
            account[i] = account[i] | ((o[10usize + k] as u64) << ((8usize * k) as u8));
        }
    }

    // Rebuild the balance table: id u64 | balance u64 per row.
    let mut id = [0u64; 16];
    let mut balance = [0u64; 16];
    for m in 0usize..16usize {
        let mut r = [0u8; 16];
        for k in 0usize..16usize {
            r[k] = p0.accounts[m][k] ^ p1.accounts[m][k] ^ p2.accounts[m][k];
        }
        for k in 0usize..8usize {
            id[m] = id[m] | ((r[k] as u64) << ((8usize * k) as u8));
            balance[m] = balance[m] | ((r[8usize + k] as u64) << ((8usize * k) as u8));
        }
    }

    // Each order's account row: the first row whose id matches.
    let mut hit = [[false; 16]; 16];
    let mut found = [false; 16];
    for i in 0usize..16usize {
        for m in 0usize..16usize {
            hit[i][m] = !found[i] & (account[i] == id[m]);
            found[i] = found[i] | hit[i][m];
        }
    }

    // In batch order, reserve each order's worst case (size x 2 x price half-ticks) from
    // its row; an order that doesn't fit what's left becomes a dummy. Sums stay in u32:
    // 16 x MAX_SIZE x 198 < 2^32.
    let mut reserved = [0u32; 16];
    for i in 0usize..16usize {
        let mut worst = 0u32;
        for k in 0usize..8usize {
            if ((price[i] >> (k as u8)) & 1u8) == 1u8 {
                worst = worst + (size[i] << ((k + 1usize) as u8));
            }
        }
        let mut have = 0u64;
        let mut used = 0u32;
        for m in 0usize..16usize {
            have = have | if hit[i][m] { balance[m] } else { 0u64 };
            used = used | if hit[i][m] { reserved[m] } else { 0u32 };
        }
        let ok = found[i] & (((used + worst) as u64) <= have);
        let take = if ok { worst } else { 0u32 };
        for m in 0usize..16usize {
            reserved[m] = reserved[m] + if hit[i][m] { take } else { 0u32 };
        }
        size[i] = if ok { size[i] } else { 0u32 };
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
                for bit in 0usize..8usize {
                    if ((c >> (bit as u8)) & 1u8) == 1u8 {
                        yc = yc + (f << (bit as u8));
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

    // Debit each row what its orders actually paid (never more than they reserved).
    let mut paid = [0u32; 16];
    for i in 0usize..16usize {
        for m in 0usize..16usize {
            paid[m] = paid[m] + if hit[i][m] { cost[i] } else { 0u32 };
        }
    }

    // Fill record (zpredict_core::fill_records): size u32 LE | total cost u32 LE (half-ticks)
    // | side u8 | flags u8 (bit0 = filled); all zero when unfilled. Balance: u64 LE.
    // Everything is masked by all three parties' masks.
    let mut fills = [[0u8; 10]; 16];
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
            fills[i][k] = r[k] ^ p0.fill_mask[i][k] ^ p1.fill_mask[i][k] ^ p2.fill_mask[i][k];
        }
    }
    let mut balances = [[0u8; 8]; 16];
    for m in 0usize..16usize {
        let left = balance[m] - (paid[m] as u64);
        for k in 0usize..8usize {
            let byte = (left >> ((8usize * k) as u8)) as u8;
            balances[m][k] =
                byte ^ p0.balance_mask[m][k] ^ p1.balance_mask[m][k] ^ p2.balance_mask[m][k];
        }
    }
    (fills, balances)
}
