//! `GET /health`, `GET /markets`, `GET /view`.

use axum::Json;
use axum::extract::{Query, State};
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use serde_json::json;
use zpredict_oracle::Market;

use super::Api;

/// Most items one `/view` call returns.
const VIEW_PAGE: usize = 200;

pub async fn health(State(api): State<Api>) -> Response {
    let s = api.state.lock().expect("state lock");
    Json(json!({ "relayer": s.index, "height": s.height, "batch": s.batch, "peers": s.peers }))
        .into_response()
}

/// `Market` plus the public clearing prices (#39): `lastPrice` and `history` in cents,
/// YES side. Prices are public by design; sizes and counts are not published.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MarketView<'a> {
    #[serde(flatten)]
    market: &'a Market,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_price: Option<f64>,
    #[serde(skip_serializing_if = "<[f64]>::is_empty")]
    history: &'a [f64],
}

pub async fn markets(State(api): State<Api>) -> Response {
    let s = api.state.lock().expect("state lock");
    let list: Vec<MarketView> = (s.markets.iter())
        .map(|m| {
            let history = s.history(m.id);
            MarketView {
                market: m,
                last_price: history.last().copied(),
                history,
            }
        })
        .collect();
    Json(list).into_response()
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
