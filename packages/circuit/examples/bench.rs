//! Clearing benchmark: three separate processes over localhost TCP.
//!
//! `cargo run --release -p zpredict-circuit --example bench [runs] [rows] [slots]` spawns
//! parties 0, 1, 2 as child processes (`bench party <p> <seed> <rows> <slots>`), checks that their
//! shares combine to `clear_with_balances`' result, and prints per-party MPC timings.

use std::{
    process::{Command, Stdio},
    time::Instant,
};

use zpredict_core::{BALANCE_LEN, FILL_LEN};

use zpredict_circuit::{
    DEFAULT_POSITIONS, DEFAULT_ROWS, DEFAULT_SLOTS, DEFAULT_WITHDRAWALS, Outcome, and_gates,
    harness::{MARKETS, Rng, combine, expected, localhost, random_batch},
    net::TcpChannel,
    program, resolve_program, run_party_on,
};

const PORT: u16 = 7200;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let arg = |i: usize, default: u64| args.get(i).map_or(default, |a| a.parse().unwrap());
    if args.get(1).map(String::as_str) == Some("party") {
        let slots = arg(5, DEFAULT_SLOTS as u64) as usize;
        return party(arg(2, 0) as usize, arg(3, 0), arg(4, 0) as usize, slots).await;
    }
    let (runs, rows) = (arg(1, 3), arg(2, DEFAULT_ROWS as u64) as usize);
    let slots = arg(3, DEFAULT_SLOTS as u64) as usize;
    let t = Instant::now();
    let gates = and_gates(program(slots, rows, MARKETS.len(), DEFAULT_WITHDRAWALS));
    println!(
        "N = {slots}, {rows} rows, {} market slots, {gates} AND gates, compiled in {:.1?}",
        MARKETS.len(),
        t.elapsed()
    );
    let positions = DEFAULT_POSITIONS;
    let resolve = and_gates(resolve_program(positions, rows));
    println!("resolution: {positions} positions per run, {resolve} AND gates");
    let exe = std::env::current_exe().unwrap();
    for seed in 1..=runs {
        let kids: Vec<_> = (0..3)
            .map(|p| {
                let args = [
                    "party",
                    &p.to_string(),
                    &seed.to_string(),
                    &rows.to_string(),
                    &slots.to_string(),
                ];
                Command::new(&exe)
                    .args(args)
                    .stdout(Stdio::piped())
                    .spawn()
                    .unwrap()
            })
            .collect();
        let outs: Vec<String> = kids
            .into_iter()
            .map(|k| String::from_utf8(k.wait_with_output().unwrap().stdout).unwrap())
            .collect();
        let shares: [Outcome; 3] = std::array::from_fn(|p| {
            let mut words = outs[p].split_whitespace();
            let [time, prices, withdrawn, hex] = [0; 4].map(|_| words.next().unwrap());
            print!("party {p}: {time}  ");
            let mut out = parse(hex, slots);
            out.prices = prices.split(',').map(|p| p.parse().ok()).collect();
            out.withdrawn = withdrawn.chars().map(|c| c == '1').collect();
            out
        });
        let want = expected(&random_batch(&mut Rng(seed), slots, rows));
        let public = |s: &Outcome| (s.prices.clone(), s.withdrawn.clone());
        let same = shares.iter().all(|s| public(s) == public(&want));
        let ok = same && combine(&shares) == want;
        let status = if ok { "matches" } else { "MISMATCH" };
        println!("| seed {seed}: prices {:?}, {status}", want.prices);
        assert!(ok);
    }
}

async fn party(p: usize, seed: u64, rows: usize, slots: usize) {
    program(slots, rows, MARKETS.len(), DEFAULT_WITHDRAWALS); // compile now, not in the timing
    let batch = random_batch(&mut Rng(seed), slots, rows);
    let channel = TcpChannel::connect(p, &localhost(PORT)).await.unwrap();
    let t = Instant::now(); // MPC only: excludes compile and waiting for peers
    let out = run_party_on(&channel, p, &batch.public, &batch.shares(p))
        .await
        .unwrap();
    let bytes = out
        .fills
        .iter()
        .flatten()
        .chain(out.balances.iter().flatten());
    let hex: String = bytes.map(|b| format!("{b:02x}")).collect();
    let prices: Vec<String> = (out.prices.iter())
        .map(|p| p.map_or("-".into(), |p| p.to_string()))
        .collect();
    let withdrawn: String = out
        .withdrawn
        .iter()
        .map(|&w| if w { '1' } else { '0' })
        .collect();
    println!("{:.2?} {} {withdrawn} {hex}", t.elapsed(), prices.join(","));
}

fn parse(hex: &str, slots: usize) -> Outcome {
    let b: Vec<u8> = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
        .collect();
    let (f, bal) = b.split_at(slots * FILL_LEN);
    Outcome {
        fills: f.chunks(FILL_LEN).map(|c| c.try_into().unwrap()).collect(),
        balances: bal
            .chunks(BALANCE_LEN)
            .map(|c| c.try_into().unwrap())
            .collect(),
        prices: Vec::new(),
        withdrawn: Vec::new(),
    }
}
