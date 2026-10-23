//! HTTP: `GET /status`, `POST /challenge`, `POST /drip`, and a static landing at `/`.
//!
//! Privacy: nothing here logs request data, reads the peer address or sets cookies. CORS
//! answers only the configured app origins; every response is `no-store` with a
//! self-only CSP; bodies are capped at 4 KiB.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{DefaultBodyLimit, Query, Request, State};
use axum::http::{HeaderValue, Method, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use crate::devtool::Devtool;
use crate::limit::Limiter;
use crate::pow::{Pow, Reject};
use crate::turnstile::Turnstile;
use crate::{DROP_ZATS, FEE_ZATS, memo};

pub struct Faucet {
    pub devtool: Devtool,
    /// The escrow's unified address every drop pays.
    pub escrow: String,
    /// Exact `Origin` values allowed by CORS, e.g. `https://app.zpredict.site`.
    pub origins: Vec<String>,
    /// Where the landing's "Open in app" goes.
    pub app_url: String,
    pub pow: Pow,
    pub turnstile: Option<Turnstile>,
    pub limit: Mutex<Limiter>,
    pub cache: Mutex<Cache>,
    /// One devtool call at a time: they share one sqlite wallet.
    pub wallet: tokio::sync::Mutex<()>,
}

#[derive(Default)]
pub struct Cache {
    /// Spendable shielded zats at the last sync.
    pub balance: Option<u64>,
    /// Mined height of each wallet transaction at the last sync.
    pub mined: HashMap<String, Option<u32>>,
}

pub type Shared = Arc<Faucet>;

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

pub fn router(f: Shared) -> Router {
    Router::new()
        .route("/", get(landing))
        .route("/faucet.css", get(css))
        .route("/status", get(status))
        .route("/challenge", post(challenge))
        .route("/drip", post(drip))
        .fallback(|| async { fail(StatusCode::NOT_FOUND, "not found") })
        .layer(DefaultBodyLimit::max(4096))
        .layer(middleware::from_fn_with_state(f.clone(), headers))
        .with_state(f)
}

/// Syncs the wallet and refreshes the balance and the mined heights.
pub async fn refresh(f: &Shared) -> Result<(), String> {
    let _g = f.wallet.lock().await;
    let g = f.clone();
    let (balance, mined) = tokio::task::spawn_blocking(move || {
        g.devtool.sync()?;
        Ok::<_, String>((g.devtool.spendable()?, g.devtool.mined()?))
    })
    .await
    .map_err(|e| e.to_string())??;
    let mut c = f.cache.lock().expect("cache lock");
    (c.balance, c.mined) = (Some(balance), mined);
    Ok(())
}

async fn headers(State(f): State<Shared>, req: Request, next: Next) -> Response {
    let origin = req.headers().get(header::ORIGIN).cloned();
    let allowed = origin
        .as_ref()
        .filter(|o| f.origins.iter().any(|a| a.as_bytes() == o.as_bytes()));
    let allowed = allowed.cloned();
    let mut res = if req.method() == Method::OPTIONS {
        StatusCode::NO_CONTENT.into_response()
    } else {
        next.run(req).await
    };
    let h = res.headers_mut();
    let csp = "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    h.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(csp),
    );
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    h.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    h.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    h.insert(header::VARY, HeaderValue::from_static("origin"));
    if let Some(o) = allowed {
        h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, o);
        h.insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET, POST"),
        );
        h.insert(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static("content-type"),
        );
    }
    res
}

fn fail(code: StatusCode, msg: &str) -> Response {
    (code, Json(json!({ "error": msg }))).into_response()
}

/// Whether a drop can go out today at all (balance and cap), and seconds to the next slot.
fn availability(f: &Faucet, t: u64) -> (bool, u64, u32) {
    let balance = f.cache.lock().expect("cache lock").balance;
    let mut l = f.limit.lock().expect("limit lock");
    let (wait, left) = (l.wait(t), l.left_today(t));
    let funded = balance.is_some_and(|b| b >= DROP_ZATS + FEE_ZATS);
    (funded && left > 0, wait, left)
}

#[derive(Deserialize)]
struct StatusQuery {
    tx: Option<String>,
}

async fn status(State(f): State<Shared>, Query(q): Query<StatusQuery>) -> Response {
    let (enabled, wait, left) = availability(&f, now());
    let c = f.cache.lock().expect("cache lock");
    let tx =
        q.tx.filter(|t| t.len() == 64)
            .map(|t| match c.mined.get(&t) {
                Some(h) => json!({ "known": true, "mined": h }),
                None => json!({ "known": false, "mined": null }),
            });
    Json(json!({
        "enabled": enabled,
        "balance": c.balance,
        "drop": DROP_ZATS,
        "nextDrop": wait,
        "leftToday": left,
        "powBits": f.pow.bits,
        "turnstile": f.turnstile.is_some(),
        "tx": tx,
    }))
    .into_response()
}

async fn challenge(State(f): State<Shared>) -> Response {
    Json(json!({ "challenge": f.pow.issue(now()), "bits": f.pow.bits, "ttl": crate::pow::TTL }))
        .into_response()
}

#[derive(Deserialize)]
struct Solution {
    challenge: String,
    nonce: u64,
}

#[derive(Deserialize)]
struct Drip {
    memo: String,
    pow: Solution,
    #[serde(default)]
    turnstile: String,
}

async fn drip(State(f): State<Shared>, Json(d): Json<Drip>) -> Response {
    let t = now();
    let Some(m) = memo::parse(&d.memo) else {
        return fail(StatusCode::BAD_REQUEST, "not a v2 deposit memo");
    };
    let (enabled, wait, _) = availability(&f, t);
    if !enabled {
        return fail(
            StatusCode::SERVICE_UNAVAILABLE,
            "the faucet is empty or done for today",
        );
    }
    if wait > 0 {
        return busy(wait);
    }
    if let Err(r) = f.pow.verify(&d.pow.challenge, &m, d.pow.nonce, t) {
        let msg = match r {
            Reject::Malformed => "unknown challenge",
            Reject::Expired => "challenge expired",
            Reject::Spent => "challenge already used",
            Reject::TooWeak => "proof of work too weak",
        };
        return fail(StatusCode::FORBIDDEN, msg);
    }
    if let Some(ts) = &f.turnstile
        && !ts.verify(&d.turnstile, &d.pow.challenge).await
    {
        return fail(StatusCode::FORBIDDEN, "Turnstile check failed");
    }
    if let Err(w) = f.limit.lock().expect("limit lock").take(t) {
        return busy(w);
    }
    let zec = format!("{}.{:08}", DROP_ZATS / 100_000_000, DROP_ZATS % 100_000_000);
    let uri = format!("zcash:{}?amount={zec}&memo={}", f.escrow, memo::param(&m));
    let _g = f.wallet.lock().await;
    let g = f.clone();
    let sent = tokio::task::spawn_blocking(move || {
        g.devtool.sync()?;
        g.devtool.pay(&uri)
    })
    .await
    .unwrap_or_else(|e| Err(e.to_string()));
    match sent {
        Ok(txid) => {
            let mut c = f.cache.lock().expect("cache lock");
            c.mined.insert(txid.clone(), None);
            c.balance = c.balance.map(|b| b.saturating_sub(DROP_ZATS + FEE_ZATS));
            Json(json!({ "txid": txid })).into_response()
        }
        Err(e) => {
            // devtool's own error (funds, network); it never echoes the memo.
            eprintln!("drip: {e}");
            fail(
                StatusCode::BAD_GATEWAY,
                "the faucet could not send; try again later",
            )
        }
    }
}

fn busy(wait: u64) -> Response {
    let body = json!({ "error": "one drop at a time; try again shortly", "retryAfter": wait });
    (StatusCode::TOO_MANY_REQUESTS, Json(body)).into_response()
}

async fn landing(State(f): State<Shared>) -> Html<String> {
    let (enabled, wait, left) = availability(&f, now());
    let balance = f.cache.lock().expect("cache lock").balance;
    let tez = |z: u64| format!("{}.{:08}", z / 100_000_000, z % 100_000_000);
    let state = match (enabled, balance) {
        (_, None) => "syncing".to_owned(),
        (false, _) => "paused: empty or done for today".to_owned(),
        (true, _) if wait > 0 => format!("next drop in {wait} s"),
        (true, _) => "ready".to_owned(),
    };
    Html(
        include_str!("landing.html")
            .replace("{balance}", &balance.map_or("…".into(), tez))
            .replace("{state}", &state)
            .replace("{left}", &left.to_string())
            .replace("{app}", &f.app_url),
    )
}

async fn css() -> Response {
    let mut r = include_str!("faucet.css").into_response();
    r.headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static("text/css"));
    r
}

#[cfg(test)]
#[path = "api_tests.rs"]
mod tests;
