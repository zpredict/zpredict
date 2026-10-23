//! `GET /accounts/{id}?key={share}`.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use super::{Api, fail, hex_id, hex_key};

/// `{balanceShare: hex16, seat}`: this relayer's u64 LE share of account `id` (hex16, the
/// u64 LE id), and whether the account is `seated` in the batch's table rows, `waiting`
/// past them (the table is full, so its orders can't fill yet) or `none` (no row yet).
/// `key` must be this relayer's share of the account's key (hex32), which only the
/// account's browser and this relayer know, so another relayer cannot collect the shares
/// and read the balance, nor anyone learn another account's seat. Ids with no key here
/// hold a zero share.
pub async fn get(
    State(api): State<Api>,
    Path(id): Path<String>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let (Some(id), Some(key)) = (hex_id(&id), q.get("key").and_then(|k| hex_key(k))) else {
        return fail(StatusCode::NOT_FOUND, "bad account");
    };
    let s = api.state.lock().expect("state lock");
    if s.table.has_key(id) && !s.table.key_matches(id, &key) {
        return fail(StatusCode::FORBIDDEN, "wrong key");
    }
    let share = s.table.balance_share(id);
    let seat = s.seat(id, api.table_rows);
    Json(json!({ "balanceShare": hex::encode(share), "seat": seat })).into_response()
}
