//! `POST /judge/claim`: MOCK, testnet/regtest only (config refuses it on mainnet).

use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;

use super::{Api, fail, hex_id, hex_key};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Claim {
    account: String,
    key_share: String,
}

/// `{account: hex16, keyShare: hex32}` → `200 {}`. The browser makes the account's key
/// itself and sends each relayer its own share (as a deposit memo would); every relayer
/// registers it and relayer 0 credits the judge amount `(credit, 0, 0)`. Only new ids:
/// a known one answers `409`, so a claim never replaces a key or tops up an account.
pub async fn claim(State(api): State<Api>, body: Bytes) -> Response {
    let Some(credit) = api.judge_credit else {
        return fail(StatusCode::NOT_FOUND, "not found");
    };
    let c = serde_json::from_slice::<Claim>(&body).ok();
    let Some((id, share)) = c.and_then(|c| Some((hex_id(&c.account)?, hex_key(&c.key_share)?)))
    else {
        return fail(StatusCode::BAD_REQUEST, "bad claim");
    };
    let mut s = api.state.lock().expect("state lock");
    match s.claim(id, share, credit) {
        Ok(true) => Json(json!({})).into_response(),
        Ok(false) => fail(StatusCode::CONFLICT, "account exists"),
        Err(_) => fail(StatusCode::INTERNAL_SERVER_ERROR, "store failed"),
    }
}
