//! `zpredict-faucet` runs the faucet, configured from the environment:
//!
//! | variable | default | |
//! |---|---|---|
//! | `FAUCET_ESCROW_UA` | (required) | escrow unified address every drop pays |
//! | `FAUCET_LISTEN` | `0.0.0.0:8080` | |
//! | `FAUCET_DEVTOOL` | `/usr/local/bin/zcash-devtool` | |
//! | `FAUCET_WALLET` | `/wallet/wallet` | the faucet's zcash-devtool wallet |
//! | `FAUCET_IDENTITY` | `/wallet/age.txt` | age identity its mnemonic is encrypted to |
//! | `FAUCET_SERVER` | `zecrocks` | lightwalletd (devtool `-s`) |
//! | `FAUCET_ORIGINS` | `https://app.zpredict.site` | CORS origins, comma separated |
//! | `FAUCET_APP_URL` | `https://app.zpredict.site/faucet/` | landing's "Open in app" |
//! | `FAUCET_INTERVAL_SECS` / `FAUCET_DAILY_CAP` | `30` / `100` | global rate limit |
//! | `FAUCET_POW_BITS` | `18` | hashcash difficulty |
//! | `FAUCET_SYNC_SECS` | `30` | wallet sync period |
//! | `TURNSTILE_SECRET_KEY` | unset = off | Cloudflare Turnstile secret (secret env only) |
//! | `FAUCET_TURNSTILE_URL` | Cloudflare's siteverify | |
//!
//! `zpredict-faucet solve <challenge> <memo> <bits>` prints a proof-of-work nonce (scripts).

use std::process::ExitCode;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use zpredict_faucet::api::{self, Faucet};
use zpredict_faucet::devtool::Devtool;
use zpredict_faucet::limit::Limiter;
use zpredict_faucet::memo;
use zpredict_faucet::pow::{self, Pow};
use zpredict_faucet::turnstile::{SITEVERIFY, Turnstile};

fn env(k: &str, default: &str) -> String {
    std::env::var(k)
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| default.to_owned())
}

fn num<T: std::str::FromStr>(k: &str, default: T) -> T {
    std::env::var(k)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[tokio::main]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let [cmd, challenge, m, bits] = args.as_slice()
        && cmd == "solve"
    {
        let (Some(m), Ok(bits)) = (memo::parse(m), bits.parse()) else {
            eprintln!("solve: bad memo or bits");
            return ExitCode::from(2);
        };
        println!("{}", pow::solve(challenge, &m, bits));
        return ExitCode::SUCCESS;
    }
    let escrow = env("FAUCET_ESCROW_UA", "");
    if escrow.is_empty() || !args.is_empty() {
        eprintln!("usage: FAUCET_ESCROW_UA=<ua> zpredict-faucet | solve <challenge> <memo> <bits>");
        return ExitCode::from(2);
    }
    let turnstile = std::env::var("TURNSTILE_SECRET_KEY")
        .ok()
        .filter(|s| !s.is_empty())
        .map(|s| Turnstile::new(s, env("FAUCET_TURNSTILE_URL", SITEVERIFY)));
    let f = Arc::new(Faucet {
        devtool: Devtool {
            bin: env("FAUCET_DEVTOOL", "/usr/local/bin/zcash-devtool").into(),
            wallet: env("FAUCET_WALLET", "/wallet/wallet").into(),
            identity: env("FAUCET_IDENTITY", "/wallet/age.txt").into(),
            server: env("FAUCET_SERVER", "zecrocks"),
        },
        escrow,
        origins: env("FAUCET_ORIGINS", "https://app.zpredict.site")
            .split(',')
            .map(|s| s.trim().to_owned())
            .collect(),
        app_url: env("FAUCET_APP_URL", "https://app.zpredict.site/faucet/"),
        pow: Pow::new(num("FAUCET_POW_BITS", 18)),
        turnstile,
        limit: Mutex::new(Limiter::new(
            num("FAUCET_INTERVAL_SECS", 30),
            num("FAUCET_DAILY_CAP", 100),
        )),
        cache: Mutex::default(),
        wallet: tokio::sync::Mutex::new(()),
    });
    if f.turnstile.is_none() {
        eprintln!("faucet: TURNSTILE_SECRET_KEY unset, Turnstile off (dev and regtest only)");
    }

    let sync = f.clone();
    let every = Duration::from_secs(num("FAUCET_SYNC_SECS", 30));
    tokio::spawn(async move {
        loop {
            if let Err(e) = api::refresh(&sync).await {
                eprintln!("faucet sync: {e}");
            }
            tokio::time::sleep(every).await;
        }
    });

    let addr = env("FAUCET_LISTEN", "0.0.0.0:8080");
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("faucet: bind {addr}: {e}");
            return ExitCode::FAILURE;
        }
    };
    eprintln!("faucet on http://{addr}");
    match axum::serve(listener, api::router(f)).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("faucet: {e}");
            ExitCode::FAILURE
        }
    }
}
