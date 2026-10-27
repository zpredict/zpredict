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
const MEMO_VECTORS: &str = include_str!("../../../../packages/settle/testdata/memo-vectors.json");
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
        table_rows: 2,
        judge_credit,
        memo_key: Some(memo_vector(index)),
        group_key: None,
        escrow: None,
        references: Default::default(),
        price: Default::default(),
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

/// Relayer `i`'s memo public key from the settle/sdk memo vectors.
fn memo_vector(i: usize) -> [u8; 32] {
    let v: Value = serde_json::from_str(MEMO_VECTORS).unwrap();
    let mut k = [0u8; 32];
    hex::decode_to_slice(v["relayers"][i]["public"].as_str().unwrap(), &mut k).unwrap();
    k
}

#[tokio::test]
async fn memo_key_contract() {
    let (app, _) = app(2, "api-memo-key", false);
    let (code, body) = call(&app, "GET", "/memo-key", None).await;
    let want = json!({"relayer": 2, "memoKey": hex::encode(memo_vector(2))});
    assert_eq!((code, body), (StatusCode::OK, want));
}

fn vector_share(k: usize) -> String {
    let v: Value = serde_json::from_str(VECTORS).unwrap();
    v["split"]["shares"][k].as_str().unwrap().to_owned()
}

/// Regression #92 (PR #92): `/view` publishes digests only (no orderId, no share), and a
/// fill share is served only with the read token this relayer got with the order.
#[tokio::test]
async fn orders_contract() {
    let (app, state) = app(1, "api-orders", false);
    let id = "0123456789abcdef0123456789abcdef";
    let token = "5a".repeat(16);
    let share = vector_share(1);
    let (code, body) = call(
        &app,
        "POST",
        "/orders",
        Some(json!({"orderId": id, "share": share, "token": token})),
    )
    .await;
    assert_eq!((code, body), (StatusCode::ACCEPTED, json!({"batch": 1})));
    // One share per order per relayer, ever.
    let again = json!({"orderId": id, "share": vector_share(2), "token": token});
    assert_eq!(
        call(&app, "POST", "/orders", Some(again)).await.0,
        StatusCode::CONFLICT
    );
    for bad in [
        json!({"orderId": id.to_uppercase(), "share": share, "token": token}),
        json!({"orderId": id, "share": &share[2..], "token": token}),
        json!({"orderId": id, "share": share, "token": token, "extra": 1}),
        json!({"orderId": id, "share": share}),
        json!({"orderId": id, "share": share, "token": &token[2..]}),
        json!({"orderId": id}),
    ] {
        assert_eq!(
            call(&app, "POST", "/orders", Some(bad)).await.0,
            StatusCode::BAD_REQUEST
        );
    }
    let path = format!("/orders/{id}?token={token}");
    assert_eq!(
        call(&app, "GET", &path, None).await.1,
        json!({"status": "pending"})
    );
    // Every relayer knows every orderId; only the browser's token reads this share.
    for other in [
        format!("/orders/{id}"),
        format!("/orders/{id}?token={}", "5b".repeat(16)),
    ] {
        assert_eq!(
            call(&app, "GET", &other, None).await,
            (StatusCode::NOT_FOUND, json!({"error": "unknown order"}))
        );
    }
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
        credits: vec![],
        deposits: vec![],
        withdrawals: vec![],
        at: 1_792_700_000,
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
    // Digests only: no orderId, no share, so the three public views can't be XORed.
    let digest = crate::state::view_digest(&hex::decode(&share).unwrap());
    assert_eq!(
        view["items"][0],
        json!({"seq": 1, "kind": "order", "digest": digest})
    );
    // Pinned for the sdk's `viewDigest` (packages/sdk/src/index.test.ts).
    assert_eq!(digest, "11fde0156c756157bd540f66eab111fc");
    assert!(!view.to_string().contains(id) && !view.to_string().contains(&share));
    assert_eq!(
        call(&app, "GET", "/view?after=2", None).await.1,
        json!({"items": []})
    );

    let (_, markets) = call(&app, "GET", "/markets", None).await;
    assert_eq!(markets[0]["lastPrice"], json!(57.5));
    assert_eq!(markets[0]["history"], json!([57.5]));
    assert_eq!(markets[0]["historyAt"], json!([1_792_700_000u64]));
    assert!(markets[1].get("lastPrice").is_none());
}

#[tokio::test]
async fn health_and_cors() {
    let (app, _) = app(0, "api-misc", true);
    let (_, h) = call(&app, "GET", "/health", None).await;
    assert_eq!(
        h,
        json!({"relayer": 0, "height": 0, "batch": 1, "commits": 0, "peers": [true, false, false]})
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
