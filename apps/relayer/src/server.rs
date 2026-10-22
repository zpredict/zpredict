//! Wires config, state, the peer listener, the batch loop, the chain poller and HTTP.

use std::time::Duration;

use crate::api::{self, Api};
use crate::batch::{self, Batcher};
use crate::chain;
use crate::config::Config;
use crate::error::{Error, Result};
use crate::keys::read_key;
use crate::mpc::{Matcher, Polytune};
use crate::peers::Peering;
use crate::state::State;

/// Picks the matcher and runs until the HTTP server stops.
pub async fn run(c: Config) -> Result<()> {
    if c.insecure_matcher {
        #[cfg(feature = "dev-insecure")]
        {
            eprintln!(
                "WARNING: insecure_matcher: relayer 0 sees every order in the clear. Local dev only."
            );
            return serve(c, crate::mpc::InsecureLocalMatcher).await;
        }
        #[cfg(not(feature = "dev-insecure"))]
        return Err(Error::Config(
            "insecure_matcher needs a build with --features dev-insecure".into(),
        ));
    }
    // Compile the Garble program now, not inside the first batch (~6 s at 8 slots and
    // 32 rows, ~25 s at 16 slots).
    if !(2..=zpredict_circuit::MAX_SLOTS).contains(&c.batch_size) {
        return Err(Error::Config(format!(
            "batch_size must be 2..={}",
            zpredict_circuit::MAX_SLOTS
        )));
    }
    let markets = zpredict_circuit::DEFAULT_MARKETS;
    let _ = zpredict_circuit::program(c.batch_size, c.table_rows, markets);
    serve(c, Polytune).await
}

pub async fn serve<M: Matcher + Send + 'static>(c: Config, matcher: M) -> Result<()> {
    let (slots, rows) = (c.batch_size, c.table_rows);
    let state = State::open(c.index, c.markets.clone(), &c.data_dir)?.shared();
    let public = [
        read_key(&c.peer_keys[0])?,
        read_key(&c.peer_keys[1])?,
        read_key(&c.peer_keys[2])?,
    ];
    let peering = Peering::new(c.index, c.peers, read_key(&c.key_file)?, public);
    let http = tokio::net::TcpListener::bind(c.listen).await?;
    eprintln!(
        "relayer {} on http://{} (peers on {})",
        c.index, c.listen, c.peers[c.index]
    );

    tokio::spawn(peering.clone().listen());
    let b = Batcher {
        state: state.clone(),
        peering,
        matcher,
        slots,
        rows,
        window: Duration::from_secs(c.window_secs),
        expire: c.expire_batches,
    };
    let handle = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || handle.block_on(batch::run(b)));
    // Market progress and resolution read the oracle (mainnet) chain only. The escrow
    // endpoint, `c.escrow_lightwalletd`, is for the settle scanner and payouts.
    if !c.oracle_lightwalletd.is_empty() {
        let (url, s) = (c.oracle_lightwalletd.clone(), state.clone());
        tokio::task::spawn_blocking(move || chain::poll(&url, s));
    }

    let judge_credit = c.judge.then_some(c.judge_credit);
    let memo_key = c.memo_key_file.as_deref().map(read_key).transpose()?;
    let origin = c.web_origin.as_str().into();
    let app = api::router(Api {
        state,
        origin,
        judge_credit,
        memo_key,
    });
    axum::serve(http, app).await?;
    Ok(())
}
