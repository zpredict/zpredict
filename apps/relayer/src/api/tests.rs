//! API contract tests: shapes from DESIGN.md "Relayer API" and the sdk types, with
//! shares taken from `packages/core/testdata/vectors.json`.

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode, header};
use serde_json::{Value, json};
use tower::ServiceExt;

use super::{Api, router};
use crate::config::{Config, tests::EXAMPLE};
use crate::state::State;
use crate::store::{Event, tests::temp_dir};

const VECTORS: &str = include_str!("../../../../packages/core/testdata/vectors.json");
const ORIGIN: &str = "http://localhost:3000";

pub fn app(index: usize, name: &str, judge: bool) -> (Router, crate::state::Shared) {
    let c = Config::parse(EXAMPLE, std::iter::empty()).unwrap();
    let state = State::open(index, c.markets, &temp_dir(name))
        .unwrap()
        .shared();
    let judge_credit = judge.then_some(5000);
    let api = Api {
        state: state.clone(),
        origin: ORIGIN.into(),
        judge_credit,
    };
    (router(api), state)
}

pub async fn call(
    app: &Router,
    method: &str,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let req = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::ORIGIN, ORIGIN);
    let req = match body {
        Some(b) => req
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(b.to_string())),
        None => req.body(Body::empty()),
    };
    let res = app.clone().oneshot(req.unwrap()).await.unwrap();
    let code = res.status();
    let h = res.headers();
    assert_eq!(h[header::CACHE_CONTROL], "no-store");
    assert!(h.get(header::SET_COOKIE).is_none());
    let bytes = to_bytes(res.into_body(), 1 << 20).await.unwrap();
    (code, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn vector_share(k: usize) -> String {
    let v: Value = serde_json::from_str(VECTORS).unwrap();
    v["split"]["shares"][k].as_str().unwrap().to_owned()
}

#[tokio::test]
async fn orders_contract() {
    let (app, state) = app(1, "api-orders", false);
    let id = "0123456789abcdef0123456789abcdef";
    let share = vector_share(1);
    let (code, body) = call(
        &app,
        "POST",
        "/orders",
        Some(json!({"orderId": id, "share": share})),
    )
    .await;
    assert_eq!((code, body), (StatusCode::ACCEPTED, json!({"batch": 1})));
    // One share per order per relayer, ever.
    let again = json!({"orderId": id, "share": vector_share(2)});
    assert_eq!(
        call(&app, "POST", "/orders", Some(again)).await.0,
        StatusCode::CONFLICT
    );
    for bad in [
        json!({"orderId": id.to_uppercase(), "share": share}),
        json!({"orderId": id, "share": &share[2..]}),
        json!({"orderId": id, "share": share, "extra": 1}),
        json!({"orderId": id}),
    ] {
        assert_eq!(
            call(&app, "POST", "/orders", Some(bad)).await.0,
            StatusCode::BAD_REQUEST
        );
    }
    let path = format!("/orders/{id}");
    assert_eq!(
        call(&app, "GET", &path, None).await.1,
        json!({"status": "pending"})
    );
    assert_eq!(
        call(&app, "GET", "/orders/00", None).await.0,
        StatusCode::NOT_FOUND
    );

    let fill = "030000003b0100000001".to_owned();
    let ids = vec![id.to_owned()];
    let fills = vec![fill.clone()];
    let ev = Event::Batch {
        batch: 1,
        ids,
        balances: vec![],
        fills,
        prices: vec![(1, 115)],
        expired: vec![],
    };
    state.lock().unwrap().record(ev).unwrap();
    let want = json!({"status": "filled", "fillShare": fill});
    assert_eq!(call(&app, "GET", &path, None).await.1, want);

    let (_, view) = call(&app, "GET", "/view?after=0", None).await;
    let kinds: Vec<&str> = view["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["kind"].as_str().unwrap())
        .collect();
    assert_eq!(kinds, ["order", "fill"]);
    assert_eq!(
        view["items"][0],
        json!({"seq": 1, "kind": "order", "orderId": id, "share": share})
    );
    assert_eq!(
        call(&app, "GET", "/view?after=2", None).await.1,
        json!({"items": []})
    );

    let (_, markets) = call(&app, "GET", "/markets", None).await;
    assert_eq!(markets[0]["lastPrice"], json!(57.5));
    assert_eq!(markets[0]["history"], json!([57.5]));
    assert!(markets[1].get("lastPrice").is_none());
}

#[tokio::test]
async fn health_accounts_judge_and_cors() {
    let (app, _) = app(0, "api-misc", true);
    let (_, h) = call(&app, "GET", "/health", None).await;
    assert_eq!(
        h,
        json!({"relayer": 0, "height": 0, "batch": 1, "peers": [true, false, false]})
    );

    let (code, claim) = call(&app, "POST", "/judge/claim", None).await;
    assert_eq!(code, StatusCode::OK);
    let tag = claim["tag"].as_str().unwrap();
    let (_, acct) = call(&app, "GET", &format!("/accounts/{tag}"), None).await;
    assert_eq!(
        acct,
        json!({"balanceShare": hex::encode(5000u64.to_le_bytes())})
    );
    let (_, zero) = call(&app, "GET", &format!("/accounts/{}", "ab".repeat(16)), None).await;
    assert_eq!(zero, json!({"balanceShare": "0000000000000000"}));
    assert_eq!(
        call(&app, "GET", "/accounts/xyz", None).await.0,
        StatusCode::NOT_FOUND
    );

    let pre = Request::builder()
        .method("OPTIONS")
        .uri("/orders")
        .header(header::ORIGIN, ORIGIN);
    let res = app
        .clone()
        .oneshot(pre.body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NO_CONTENT);
    assert_eq!(res.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN], ORIGIN);
    let other = Request::builder()
        .uri("/health")
        .header(header::ORIGIN, "https://evil.example");
    let res = app
        .clone()
        .oneshot(other.body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert!(
        res.headers()
            .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
            .is_none()
    );
}

#[tokio::test]
async fn judge_only_on_relayer_zero_when_enabled() {
    let (off, _) = app(0, "api-judge-off", false);
    assert_eq!(
        call(&off, "POST", "/judge/claim", None).await.0,
        StatusCode::NOT_FOUND
    );
    let (r1, _) = app(1, "api-judge-r1", true);
    assert_eq!(
        call(&r1, "POST", "/judge/claim", None).await.0,
        StatusCode::NOT_FOUND
    );
}
