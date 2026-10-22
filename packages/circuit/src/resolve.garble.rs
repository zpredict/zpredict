// Resolution payout for zPredict; mirrors `zpredict_core::resolve`. See resolve.rs.
// `{k}` positions and `{rows}` balance-table rows, substituted by program.rs before
// compiling (Garble ranges and array sizes must be literals, hence no consts).

// Fields in alphabetical order: that is how Garble lays out struct inputs (io.rs too).
struct Party {
    accounts: [[u8; 16]; {rows}],
    balance_mask: [[u8; 8]; {rows}],
    fills: [[u8; 10]; {k}],
    market: u32,
    orders: [[u8; 18]; {k}],
    outcome: u8,
}

pub fn main(p0: Party, p1: Party, p2: Party) -> ([[u8; 8]; {rows}], bool) {
    // The resolved market and its outcome (0 = YES, 1 = NO) are public. If the parties
    // disagree, nothing is paid and `agreed` (public) says so.
    let market = p0.market;
    let outcome = p0.outcome;
    let agreed = (p1.market == market)
        & (p2.market == market)
        & (p1.outcome == outcome)
        & (p2.outcome == outcome)
        & (outcome <= 1u8);

    // Rebuild the balance table: id u64 | balance u64 per row.
    let mut id = [0u64; {rows}];
    let mut balance = [0u64; {rows}];
    for m in 0usize..{rows}usize {
        let mut r = [0u8; 16];
        for k in 0usize..16usize {
            r[k] = p0.accounts[m][k] ^ p1.accounts[m][k] ^ p2.accounts[m][k];
        }
        for k in 0usize..8usize {
            id[m] = id[m] | ((r[k] as u64) << ((8usize * k) as u8));
            balance[m] = balance[m] | ((r[8usize + k] as u64) << ((8usize * k) as u8));
        }
    }

    // Each position (an order and its combined fill record) that filled on the winning
    // side of this market pays size × 200 half-ticks into its account's first row.
    for e in 0usize..{k}usize {
        let mut o = [0u8; 18];
        for k in 0usize..18usize {
            o[k] = p0.orders[e][k] ^ p1.orders[e][k] ^ p2.orders[e][k];
        }
        let mut f = [0u8; 10];
        for k in 0usize..10usize {
            f[k] = p0.fills[e][k] ^ p1.fills[e][k] ^ p2.fills[e][k];
        }
        let mut m = 0u32;
        let mut size = 0u64;
        for k in 0usize..4usize {
            m = m | ((o[k] as u32) << ((8usize * k) as u8));
            size = size | ((f[k] as u64) << ((8usize * k) as u8));
        }
        let mut account = 0u64;
        for k in 0usize..8usize {
            account = account | ((o[10usize + k] as u64) << ((8usize * k) as u8));
        }
        let wins = agreed & (m == market) & ((f[9] & 1u8) == 1u8) & (f[8] == outcome);
        // size × 200 = size × (128 + 64 + 8), by shifts: Garble's multiplier costs more.
        let pay = if wins { (size << 7u8) + (size << 6u8) + (size << 3u8) } else { 0u64 };
        let mut found = false;
        for r in 0usize..{rows}usize {
            let hit = !found & (account == id[r]);
            found = found | hit;
            balance[r] = balance[r] + if hit { pay } else { 0u64 };
        }
    }

    // New balances (u64 LE), masked by all three parties' masks.
    let mut balances = [[0u8; 8]; {rows}];
    for m in 0usize..{rows}usize {
        for k in 0usize..8usize {
            let byte = (balance[m] >> ((8usize * k) as u8)) as u8;
            balances[m][k] =
                byte ^ p0.balance_mask[m][k] ^ p1.balance_mask[m][k] ^ p2.balance_mask[m][k];
        }
    }
    (balances, agreed)
}
