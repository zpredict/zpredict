//! `GET /health`, `GET /markets`, `GET /price`, `GET /view`, `GET /memo-key`, `GET /group-key`.

use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use serde_json::json;
use zpredict_oracle::Market;

use super::{Api, fail};
use crate::reference::Reference;

/// Most items one `/view` call returns.
const VIEW_PAGE: usize = 200;

pub async fn health(State(api): State<Api>) -> Response {
    let s = api.state.lock().expect("state lock");
    Json(json!({ "relayer": s.index, "height": s.height, "batch": s.batch, "commits": s.commits, "peers": s.peers }))
        .into_response()
}

/// `Market` plus the public clearing prices (#39): `lastPrice` and `history` in cents,
/// YES side, and `historyAt`, when each was recorded (unix seconds, 0 = unknown; #121).
/// Prices are public by design; sizes and counts are not published.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MarketView<'a> {
    #[serde(flatten)]
    market: &'a Market,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_price: Option<f64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    history: Vec<f64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    history_at: Vec<u64>,
    /// Mirrored markets: the source's own price, fetched by this relayer (`reference.rs`).
    #[serde(skip_serializing_if = "Option::is_none")]
    reference: Option<Reference>,
}

pub async fn markets(State(api): State<Api>) -> Response {
    let refs = api.references.lock().expect("refs lock").clone();
    let s = api.state.lock().expect("state lock");
    let list: Vec<MarketView> = (s.markets.iter())
        .map(|m| {
            let (history, history_at) = s.history(m.id);
            MarketView {
                market: m,
                last_price: history.last().copied(),
                history,
                history_at,
                reference: refs.get(&m.id).cloned(),
            }
        })
        .collect();
    Json(list).into_response()
}

/// ZEC/USD spot for display only, as this relayer last fetched it; 503 before the first.
pub async fn price(State(api): State<Api>) -> Response {
    match api.price.lock().expect("price lock").clone() {
        Some(spot) => Json(spot).into_response(),
        None => fail(StatusCode::SERVICE_UNAVAILABLE, "no price yet"),
    }
}

#[derive(Deserialize)]
pub struct After {
    #[serde(default)]
    after: u64,
}

/// Exactly what this relayer sees: its own order shares and fill shares.
pub async fn view(State(api): State<Api>, Query(q): Query<After>) -> Response {
    let items = api
        .state
        .lock()
        .expect("state lock")
        .view_after(q.after, VIEW_PAGE);
    Json(json!({ "items": items })).into_response()
}

/// The FROST group key outcome signatures verify against (`verifyOutcome` in the sdk).
pub async fn group_key(State(api): State<Api>) -> Response {
    let Some(key) = api.group_key else {
        return fail(
            StatusCode::NOT_FOUND,
            "no FROST key share: outcomes are unsigned",
        );
    };
    let relayer = api.state.lock().expect("state lock").index;
    let threshold = zpredict_settle::THRESHOLD;
    Json(json!({ "relayer": relayer, "groupKey": hex::encode(key), "threshold": threshold }))
        .into_response()
}

/// The X25519 key the browser encrypts this relayer's slot of the deposit memo to.
pub async fn memo_key(State(api): State<Api>) -> Response {
    let Some(key) = api.memo_key else {
        return fail(StatusCode::NOT_FOUND, "memo key not configured");
    };
    let relayer = api.state.lock().expect("state lock").index;
    Json(json!({ "relayer": relayer, "memoKey": hex::encode(key) })).into_response()
}
