//! `POST /judge/claim`: MOCK, testnet/regtest only (config refuses it on mainnet).

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use super::{Api, fail};

/// A fresh tag credited `(credit, 0, 0)`: relayer 0 holds the amount and the others hold
/// the zero share every unknown tag has, so only relayer 0 serves this (the web app calls
/// relayer 0).
pub async fn claim(State(api): State<Api>) -> Response {
    let mut s = api.state.lock().expect("state lock");
    let Some(credit) = api.judge_credit.filter(|_| s.index == 0) else {
        return fail(StatusCode::NOT_FOUND, "not found");
    };
    let mut tag = [0u8; 16];
    getrandom::fill(&mut tag).expect("os rng");
    let tag = hex::encode(tag);
    match s.credit(&tag, credit) {
        Ok(()) => Json(json!({ "tag": tag })).into_response(),
        Err(_) => fail(StatusCode::INTERNAL_SERVER_ERROR, "store failed"),
    }
}
