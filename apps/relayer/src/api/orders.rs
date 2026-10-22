//! `POST /orders` and `GET /orders/{id}`.

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;
use zpredict_core::ORDER_LEN;

use super::{Api, fail, is_hex};
use crate::state::{Accept, Status};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OrderPost {
    order_id: String,
    share: String,
    token: String,
}

#[derive(Deserialize)]
pub struct Token {
    #[serde(default)]
    token: String,
}

/// `{orderId: hex32, share: hex52, token: hex32}` → `202 {batch}`; a second share for the
/// same orderId is refused (409), so this relayer never holds two shares of one order.
/// `token` is a fresh random value per order and relayer: every relayer knows every
/// orderId, so without it one relayer could fetch the other two fill shares.
pub async fn post(State(api): State<Api>, body: Bytes) -> Response {
    let Ok(b) = serde_json::from_slice::<OrderPost>(&body) else {
        return fail(StatusCode::BAD_REQUEST, "bad order");
    };
    if !is_hex(&b.order_id, 32) || !is_hex(&b.share, ORDER_LEN * 2) || !is_hex(&b.token, 32) {
        return fail(StatusCode::BAD_REQUEST, "bad order");
    }
    let mut share = [0u8; ORDER_LEN];
    hex::decode_to_slice(&b.share, &mut share).expect("checked hex");
    let accepted = api
        .state
        .lock()
        .expect("state lock")
        .accept(&b.order_id, share, &b.token);
    match accepted {
        Ok(Accept::Joined(batch)) => {
            (StatusCode::ACCEPTED, Json(json!({ "batch": batch }))).into_response()
        }
        Ok(Accept::Duplicate) => fail(StatusCode::CONFLICT, "duplicate"),
        Ok(Accept::Full) => fail(StatusCode::SERVICE_UNAVAILABLE, "busy"),
        Err(_) => fail(StatusCode::INTERNAL_SERVER_ERROR, "store failed"),
    }
}

/// `GET /orders/{id}?token=` → `{status, fillShare?: hex20}`. `filled` means "cleared in
/// a batch": the relayer can't tell a fill from a miss; the owner reads the flag after
/// combining all three shares. A wrong token looks exactly like an unknown order.
pub async fn get(
    State(api): State<Api>,
    Path(id): Path<String>,
    Query(q): Query<Token>,
) -> Response {
    let s = api.state.lock().expect("state lock");
    let mine =
        |o: &&crate::state::Order| is_hex(&id, 32) && is_hex(&q.token, 32) && o.token == q.token;
    let Some(o) = s.order(&id).filter(mine) else {
        return fail(StatusCode::NOT_FOUND, "unknown order");
    };
    Json(match o.status {
        Status::Pending { .. } => json!({ "status": "pending" }),
        Status::Filled(f) => json!({ "status": "filled", "fillShare": hex::encode(f) }),
        Status::Unfilled => json!({ "status": "unfilled" }),
    })
    .into_response()
}
