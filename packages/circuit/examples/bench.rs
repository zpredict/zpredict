//! N = 16 clearing benchmark: three separate processes over localhost TCP.
//!
//! `cargo run --release -p zpredict-circuit --example bench [runs]` spawns parties
//! 0, 1, 2 as child processes (`bench party <p> <seed>`), checks that their shares
//! combine to `clear`'s fill records, and prints per-party timings.

use std::{
    process::{Command, Stdio},
    time::Instant,
};

use zpredict_core::FILL_LEN;

use zpredict_circuit::{
    FillShares, N, and_gates,
    harness::{Rng, combine, expected, localhost, random_batch},
    net::TcpChannel,
    program, run_party_on,
};

const PORT: u16 = 7200;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("party") {
        let p: usize = args[2].parse().unwrap();
        let seed: u64 = args[3].parse().unwrap();
        return party(p, seed).await;
    }
    let runs: u64 = args.get(1).map_or(3, |r| r.parse().unwrap());
    let t = Instant::now();
    program();
    println!(
        "N = {N}, {} AND gates, compiled in {:.1?}",
        and_gates(),
        t.elapsed()
    );
    for seed in 1..=runs {
        let exe = std::env::current_exe().unwrap();
        let kids: Vec<_> = (0..3)
            .map(|p| {
                Command::new(&exe)
                    .args(["party", &p.to_string(), &seed.to_string()])
                    .stdout(Stdio::piped())
                    .spawn()
                    .unwrap()
            })
            .collect();
        let outs: Vec<String> = kids
            .into_iter()
            .map(|k| String::from_utf8(k.wait_with_output().unwrap().stdout).unwrap())
            .collect();
        let mut shares = [[[0u8; FILL_LEN]; N]; 3];
        for (p, out) in outs.iter().enumerate() {
            let (time, hex) = out.trim().split_once(' ').unwrap();
            shares[p] = parse(hex);
            print!("party {p}: {time}  ");
        }
        let batch = random_batch(&mut Rng(seed));
        let ok = combine(&shares) == expected(&batch.orders);
        println!(
            "| seed {seed}: {}",
            if ok { "matches clear" } else { "MISMATCH" }
        );
        assert!(ok);
    }
}

async fn party(p: usize, seed: u64) {
    program();
    let batch = random_batch(&mut Rng(seed));
    let channel = TcpChannel::connect(p, &localhost(PORT)).await.unwrap();
    let t = Instant::now(); // MPC only: excludes compile and waiting for peers
    let fills = run_party_on(&channel, p, &batch.shares[p]).await.unwrap();
    let hex: String = fills.iter().flatten().map(|b| format!("{b:02x}")).collect();
    println!("{:.2?} {hex}", t.elapsed());
}

fn parse(hex: &str) -> FillShares {
    let b: Vec<u8> = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
        .collect();
    std::array::from_fn(|i| b[i * FILL_LEN..(i + 1) * FILL_LEN].try_into().unwrap())
}
