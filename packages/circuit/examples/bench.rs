//! N = 16 clearing benchmark: three separate processes over localhost TCP.
//!
//! `cargo run --release -p zpredict-circuit --example bench [runs] [rows]` spawns parties
//! 0, 1, 2 as child processes (`bench party <p> <seed> <rows>`), checks that their
//! shares combine to `clear_with_balances`' result, and prints per-party MPC timings.

use std::{
    process::{Command, Stdio},
    time::Instant,
};

use zpredict_core::{BALANCE_LEN, FILL_LEN};

use zpredict_circuit::{
    DEFAULT_ROWS, N, Outcome, and_gates,
    harness::{MARKET, Rng, combine, expected, localhost, random_batch},
    net::TcpChannel,
    run_party_on,
};

const PORT: u16 = 7200;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let arg = |i: usize, default: u64| args.get(i).map_or(default, |a| a.parse().unwrap());
    if args.get(1).map(String::as_str) == Some("party") {
        return party(arg(2, 0) as usize, arg(3, 0), arg(4, 0) as usize).await;
    }
    let (runs, rows) = (arg(1, 3), arg(2, DEFAULT_ROWS as u64) as usize);
    let t = Instant::now();
    let gates = and_gates(rows);
    println!(
        "N = {N}, {rows} rows, {gates} AND gates, compiled in {:.1?}",
        t.elapsed()
    );
    let exe = std::env::current_exe().unwrap();
    for seed in 1..=runs {
        let kids: Vec<_> = (0..3)
            .map(|p| {
                let args = [
                    "party",
                    &p.to_string(),
                    &seed.to_string(),
                    &rows.to_string(),
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
            let (time, price, hex) = (words.next(), words.next(), words.next());
            print!("party {p}: {}  ", time.unwrap());
            parse(hex.unwrap(), price.unwrap().parse().ok())
        });
        let want = expected(&random_batch(&mut Rng(seed), rows));
        let ok = shares.iter().all(|s| s.price == want.price) && combine(&shares) == want;
        let status = if ok { "matches" } else { "MISMATCH" };
        println!("| seed {seed}: price {:?}, {status}", want.price);
        assert!(ok);
    }
}

async fn party(p: usize, seed: u64, rows: usize) {
    and_gates(rows); // compile before connecting, so it stays out of the timing
    let batch = random_batch(&mut Rng(seed), rows);
    let channel = TcpChannel::connect(p, &localhost(PORT)).await.unwrap();
    let t = Instant::now(); // MPC only: excludes compile and waiting for peers
    let (orders, accounts) = (&batch.order_shares[p], &batch.account_shares[p]);
    let out = run_party_on(&channel, p, MARKET, orders, accounts)
        .await
        .unwrap();
    let bytes = out
        .fills
        .iter()
        .flatten()
        .chain(out.balances.iter().flatten());
    let hex: String = bytes.map(|b| format!("{b:02x}")).collect();
    let price = out.price.map_or("-".into(), |p| p.to_string());
    println!("{:.2?} {price} {hex}", t.elapsed());
}

fn parse(hex: &str, price: Option<u16>) -> Outcome {
    let b: Vec<u8> = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
        .collect();
    let (f, bal) = b.split_at(N * FILL_LEN);
    Outcome {
        fills: f.chunks(FILL_LEN).map(|c| c.try_into().unwrap()).collect(),
        balances: bal
            .chunks(BALANCE_LEN)
            .map(|c| c.try_into().unwrap())
            .collect(),
        price,
    }
}
