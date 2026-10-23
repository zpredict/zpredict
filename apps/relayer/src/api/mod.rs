//! The relayer HTTP API (DESIGN.md "Relayer API"), one file per route group.
//!
//! Privacy: nothing here logs, reads the peer address, or sets cookies; CORS answers only
//! the configured web origin; bodies are capped at 1 KiB.

#[cfg(test)]
mod account_tests;
mod accounts;
mod info;
mod judge;
mod orders;
#[cfg(test)]
pub(crate) mod tests;
mod withdrawals;

use std::sync::Arc;

use axum::Router;
use axum::extract::{DefaultBodyLimit, Request, State};
use axum::http::{HeaderValue, Method, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use serde_json::json;

use crate::state::Shared;

#[derive(Clone)]
pub struct Api {
    pub state: Shared,
    pub origin: Arc<str>,
    /// Balance-table rows a batch carries (`table_rows`): accounts past it wait.
    pub table_rows: usize,
    /// `Some(credit)` when judge mode is on (relayer 0 only serves it).
    pub judge_credit: Option<u64>,
    /// This relayer's deposit-memo public key (X25519), served at `GET /memo-key`.
    pub memo_key: Option<[u8; 32]>,
    /// The escrow's FROST group key, which also signs outcomes; `None` = unsigned.
    pub group_key: Option<[u8; 32]>,
    /// With `[settlement]` on: the escrow's network, for checking payout addresses.
    pub escrow: Option<Arc<crate::escrow::Escrow>>,
    /// Mirrored markets' Polymarket reference prices (`reference.rs`).
    pub references: crate::reference::References,
}

pub fn router(api: Api) -> Router {
    Router::new()
        .route("/health", get(info::health))
        .route("/markets", get(info::markets))
        .route("/view", get(info::view))
        .route("/memo-key", get(info::memo_key))
        .route("/group-key", get(info::group_key))
        .route("/orders", post(orders::post))
        .route("/orders/{id}", get(orders::get))
        .route("/accounts/{id}", get(accounts::get))
        .route("/judge/claim", post(judge::claim))
        .route("/withdrawals", post(withdrawals::post))
        .route("/withdrawals/{id}", get(withdrawals::get))
        .fallback(|| async { fail(StatusCode::NOT_FOUND, "not found") })
        .layer(DefaultBodyLimit::max(1024))
        .layer(middleware::from_fn_with_state(api.clone(), cors))
        .with_state(api)
}

/// CORS for the web origin only, `no-store` everywhere, preflight answered here.
async fn cors(State(api): State<Api>, req: Request, next: Next) -> Response {
    let allowed = req
        .headers()
        .get(header::ORIGIN)
        .is_some_and(|o| o.as_bytes() == api.origin.as_bytes());
    let mut res = if req.method() == Method::OPTIONS {
        StatusCode::NO_CONTENT.into_response()
    } else {
        next.run(req).await
    };
    let h = res.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    h.insert(header::VARY, HeaderValue::from_static("origin"));
    if allowed && let Ok(origin) = HeaderValue::from_str(&api.origin) {
        h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
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

pub(crate) fn fail(code: StatusCode, msg: &str) -> Response {
    (code, axum::Json(json!({ "error": msg }))).into_response()
}

/// Lowercase hex of exactly `n` characters.
pub(crate) fn is_hex(s: &str, n: usize) -> bool {
    s.len() == n && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// An account id: hex16 of its u64 LE bytes.
pub(crate) fn hex_id(s: &str) -> Option<u64> {
    is_hex(s, 16).then(|| u64::from_le_bytes(crate::state::hex_array(s)))
}

/// A key share: hex32.
pub(crate) fn hex_key(s: &str) -> Option<zpredict_core::Key> {
    is_hex(s, 32).then(|| crate::state::hex_array(s))
}
