//! `GET /accounts/{tag}`.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use super::{Api, fail, is_hex};

/// `{balanceShare: hex16}`: this relayer's u64 LE share; unknown tags hold a zero share.
pub async fn get(State(api): State<Api>, Path(tag): Path<String>) -> Response {
    if !is_hex(&tag, 32) {
        return fail(StatusCode::NOT_FOUND, "bad tag");
    }
    let share = api.state.lock().expect("state lock").balance_share(&tag);
    Json(json!({ "balanceShare": hex::encode(share) })).into_response()
}
