// Batch clearing for zPredict; mirrors `zpredict_core::apply_flows` then
// `zpredict_core::clear_with_balances`. See the crate docs.
// `{n}` order slots, `{rows}` balance-table rows, `{markets}` market slots and `{w}` withdrawal
// slots, substituted by program.rs before compiling (Garble ranges and array sizes must be
// literals, hence no consts).

// Fields in alphabetical order: that is how Garble lays out struct inputs (io.rs too).
struct Party {
    accounts: [[u8; 16]; {rows}],
    balance_mask: [[u8; 8]; {rows}],
    credits: [u64; {rows}],
    fill_mask: [[u8; 10]; {n}],
    keys: [[u8; 16]; {rows}],
    markets: [u32; {markets}],
    orders: [[u8; 26]; {n}],
    withdraw_keys: [[u8; 16]; {w}],
    withdrawals: [u64; {w}],
}

pub fn main(
    p0: Party,
    p1: Party,
    p2: Party,
) -> ([[u8; 10]; {n}], [[u8; 8]; {rows}], [u16; {markets}], [bool; {w}], bool) {
    // The batch's markets (0 = unused slot), credits and withdrawal amounts (0 = unused
    // slot) are public; whose withdrawals they are is secret-shared like an order's
    // key. If the parties disagree on a public input, nothing fills, nothing moves,
    // and `agreed` (public) says so.
    let markets = p0.markets;
    let credits = p0.credits;
    let withdrawals = p0.withdrawals;
    let agreed = (p1.markets == markets)
        & (p2.markets == markets)
        & (p1.credits == credits)
        & (p2.credits == credits)
        & (p1.withdrawals == withdrawals)
        & (p2.withdrawals == withdrawals);

    // Rebuild and decode. Malformed orders (side > 1, price outside 1..=99, size > MAX_SIZE)
    // and orders for a market not in this batch become dummies.
    let mut yes = [false; {n}];
    let mut market = [0u32; {n}];
    let mut price = [0u8; {n}];
    let mut size = [0u32; {n}];
    let mut olo = [0u64; {n}];
    let mut ohi = [0u64; {n}];
    for i in 0usize..{n}usize {
        let mut o = [0u8; 26];
        for k in 0usize..26usize {
            o[k] = p0.orders[i][k] ^ p1.orders[i][k] ^ p2.orders[i][k];
        }
        let s = (o[6] as u32)
            | ((o[7] as u32) << 8u8)
            | ((o[8] as u32) << 16u8)
            | ((o[9] as u32) << 24u8);
        let m = (o[0] as u32)
            | ((o[1] as u32) << 8u8)
            | ((o[2] as u32) << 16u8)
            | ((o[3] as u32) << 24u8);
        let mut listed = false;
        for j in 0usize..{markets}usize {
            listed = listed | ((markets[j] != 0u32) & (m == markets[j]));
        }
        market[i] = m;
        let ok = agreed
            & listed
            & (o[4] <= 1u8)
            & (o[5] >= 1u8)
            & (o[5] <= 99u8)
            & (s <= 1000000u32);
        yes[i] = o[4] == 0u8;
        price[i] = o[5];
        size[i] = if ok { s } else { 0u32 };
        for k in 0usize..8usize {
            olo[i] = olo[i] | ((o[10usize + k] as u64) << ((8usize * k) as u8));
            ohi[i] = ohi[i] | ((o[18usize + k] as u64) << ((8usize * k) as u8));
        }
    }

    // Rebuild each row's key (shares from the three relayers, two u64 words): an order or
    // withdrawal may use a row only by carrying the same key, which no single relayer holds.
    let mut klo = [0u64; {rows}];
    let mut khi = [0u64; {rows}];
    for m in 0usize..{rows}usize {
        for k in 0usize..8usize {
            let lo = p0.keys[m][k] ^ p1.keys[m][k] ^ p2.keys[m][k];
            let hi = p0.keys[m][8usize + k] ^ p1.keys[m][8usize + k] ^ p2.keys[m][8usize + k];
            klo[m] = klo[m] | ((lo as u64) << ((8usize * k) as u8));
            khi[m] = khi[m] | ((hi as u64) << ((8usize * k) as u8));
        }
    }

    // Rebuild the balance table (id u64 | balance u64 per row; the id is only a label) and
    // add this batch's credits (deposits, judge credits) so they are spendable right away.
    let mut balance = [0u64; {rows}];
    for m in 0usize..{rows}usize {
        for k in 0usize..8usize {
            let b = p0.accounts[m][8usize + k] ^ p1.accounts[m][8usize + k] ^ p2.accounts[m][8usize + k];
            balance[m] = balance[m] | ((b as u64) << ((8usize * k) as u8));
        }
        balance[m] = balance[m] + if agreed { credits[m] } else { 0u64 };
    }

    // Withdrawals, in slot order and before any order reserves funds: each is taken from
    // the first row with its key only if that row covers it. `withdrawn` (public) says which
    // went through, never whose they were.
    let mut withdrawn = [false; {w}];
    for s in 0usize..{w}usize {
        let mut wlo = 0u64;
        let mut whi = 0u64;
        for k in 0usize..8usize {
            let lo = p0.withdraw_keys[s][k] ^ p1.withdraw_keys[s][k] ^ p2.withdraw_keys[s][k];
            let hi = p0.withdraw_keys[s][8usize + k]
                ^ p1.withdraw_keys[s][8usize + k]
                ^ p2.withdraw_keys[s][8usize + k];
            wlo = wlo | ((lo as u64) << ((8usize * k) as u8));
            whi = whi | ((hi as u64) << ((8usize * k) as u8));
        }
        let amount = withdrawals[s];
        let mut row = [false; {rows}];
        let mut found = false;
        let mut have = 0u64;
        for m in 0usize..{rows}usize {
            row[m] = !found & (wlo == klo[m]) & (whi == khi[m]);
            found = found | row[m];
            have = have | if row[m] { balance[m] } else { 0u64 };
        }
        let ok = agreed & found & (amount > 0u64) & (have >= amount);
        withdrawn[s] = ok;
        for m in 0usize..{rows}usize {
            balance[m] = balance[m] - if ok & row[m] { amount } else { 0u64 };
        }
    }

    // Each order's row: the first row whose key matches the order's.
    let mut hit = [[false; {rows}]; {n}];
    let mut found = [false; {n}];
    for i in 0usize..{n}usize {
        for m in 0usize..{rows}usize {
            hit[i][m] = !found[i] & (olo[i] == klo[m]) & (ohi[i] == khi[m]);
            found[i] = found[i] | hit[i][m];
        }
    }

    // In batch order, reserve each order's worst case (size x 2 x price half-ticks) from
    // its row; an order that doesn't fit what's left becomes a dummy. Sums stay in u32:
    // {n} x MAX_SIZE x 198 < 2^32 (program.rs caps {n} at 21).
    let mut reserved = [0u32; {rows}];
    for i in 0usize..{n}usize {
        let mut worst = 0u32;
        for k in 0usize..8usize {
            if ((price[i] >> (k as u8)) & 1u8) == 1u8 {
                worst = worst + (size[i] << ((k + 1usize) as u8));
            }
        }
        let mut have = 0u64;
        let mut used = 0u32;
        for m in 0usize..{rows}usize {
            have = have | if hit[i][m] { balance[m] } else { 0u64 };
            used = used | if hit[i][m] { reserved[m] } else { 0u32 };
        }
        let ok = found[i] & (((used + worst) as u64) <= have);
        let take = if ok { worst } else { 0u32 };
        for m in 0usize..{rows}usize {
            reserved[m] = reserved[m] + if hit[i][m] { take } else { 0u32 };
        }
        size[i] = if ok { size[i] } else { 0u32 };
    }

    // Markets never mix: `same[i][k]` gates both the queues and the crossing.
    let mut same = [[false; {n}]; {n}];
    for i in 0usize..{n}usize {
        for k in 0usize..{n}usize {
            if k > i {
                same[i][k] = market[i] == market[k];
                same[k][i] = same[i][k];
            }
        }
    }

    // Each order's place in its market's and side's queue (best price first, ties by
    // index), as an interval [start, end) on that queue's cumulative size axis.
    let mut start = [0u32; {n}];
    let mut end = [0u32; {n}];
    for i in 0usize..{n}usize {
        let mut acc = 0u32;
        for k in 0usize..{n}usize {
            if k != i {
                let ahead = if k < i { price[k] >= price[i] } else { price[k] > price[i] };
                if same[i][k] & (yes[k] == yes[i]) & ahead {
                    acc = acc + size[k];
                }
            }
        }
        start[i] = acc;
        end[i] = acc + size[i];
    }

    // A same-market YES/NO pair fills by the overlap of their intervals, if prices cross.
    let mut filled = [0u32; {n}];
    let mut cost = [0u32; {n}];
    for i in 0usize..{n}usize {
        for j in 0usize..{n}usize {
            if j > i {
                let lo = if start[i] > start[j] { start[i] } else { start[j] };
                let hi = if end[i] < end[j] { end[i] } else { end[j] };
                let p = if yes[i] { price[i] as u16 } else { price[j] as u16 };
                let q = if yes[i] { price[j] as u16 } else { price[i] as u16 };
                // Branch-free: an `if` around array writes makes Garble mux whole arrays.
                let cross = same[i][j] & (yes[i] != yes[j]) & (p + q >= 100u16) & (hi > lo);
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
    let mut paid = [0u32; {rows}];
    for i in 0usize..{n}usize {
        for m in 0usize..{rows}usize {
            paid[m] = paid[m] + if hit[i][m] { cost[i] } else { 0u32 };
        }
    }

    // Fill record (zpredict_core::fill_records): size u32 LE | total cost u32 LE (half-ticks)
    // | side u8 | flags u8 (bit0 = filled); all zero when unfilled. Balance: u64 LE.
    // Everything is masked by all three parties' masks.
    let mut fills = [[0u8; 10]; {n}];
    for i in 0usize..{n}usize {
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
    let mut balances = [[0u8; 8]; {rows}];
    for m in 0usize..{rows}usize {
        let left = balance[m] - (paid[m] as u64);
        for k in 0usize..8usize {
            let byte = (left >> ((8usize * k) as u8)) as u8;
            balances[m][k] =
                byte ^ p0.balance_mask[m][k] ^ p1.balance_mask[m][k] ^ p2.balance_mask[m][k];
        }
    }

    // Public clearing price per market slot (zpredict_core::clearing_price): YES cost per
    // contract over that market's fills, rounded down; 0 = nothing crossed. Every fill's
    // YES side is one YES order, so summing YES orders' records covers each fill once.
    // Unmasked: all three learn it.
    let mut prices = [0u16; {markets}];
    for j in 0usize..{markets}usize {
        let mut volume = 0u32;
        let mut yes_paid = 0u32;
        for i in 0usize..{n}usize {
            let mine = yes[i] & (market[i] == markets[j]);
            volume = volume + if mine { filled[i] } else { 0u32 };
            yes_paid = yes_paid + if mine { cost[i] } else { 0u32 };
        }
        // Divisor never 0: a 0 divisor would raise Garble's panic flag even in a dead branch.
        let divisor = if volume > 0u32 { volume } else { 1u32 };
        prices[j] = (yes_paid / divisor) as u16;
    }
    (fills, balances, prices, withdrawn, agreed)
}
