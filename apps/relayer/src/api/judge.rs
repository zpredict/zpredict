//! `POST /judge/claim`: MOCK, testnet/regtest only (config refuses it on mainnet).

use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;

use super::{Api, fail, hex_id, hex_key};
use crate::state::Claim;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ClaimPost {
    account: String,
    key_share: String,
}

/// `{account: hex16, keyShare: hex32}` → `200 {}`. The browser makes the account's key
/// itself and sends each relayer its own share (as a deposit memo would); every relayer
/// registers it and relayer 0 credits the judge amount `(credit, 0, 0)`. Only new ids: a
/// claim never replaces a key or tops up an account. The same claim again is `200` with
/// no second credit (a browser retrying after a partial failure); a known id with another
/// key is `409`; a table with `table_rows` rows already is `503` "table full" (#99).
pub async fn claim(State(api): State<Api>, body: Bytes) -> Response {
    let Some(credit) = api.judge_credit else {
        return fail(StatusCode::NOT_FOUND, "not found");
    };
    let c = serde_json::from_slice::<ClaimPost>(&body).ok();
    let Some((id, share)) = c.and_then(|c| Some((hex_id(&c.account)?, hex_key(&c.key_share)?)))
    else {
        return fail(StatusCode::BAD_REQUEST, "bad claim");
    };
    let mut s = api.state.lock().expect("state lock");
    match s.claim(id, share, credit, api.table_rows) {
        Ok(Claim::New | Claim::Again) => Json(json!({})).into_response(),
        Ok(Claim::Taken) => fail(StatusCode::CONFLICT, "account exists"),
        Ok(Claim::Full) => fail(StatusCode::SERVICE_UNAVAILABLE, "table full"),
        Err(_) => fail(StatusCode::INTERNAL_SERVER_ERROR, "store failed"),
    }
}
