//! The HTTP API against a fake zcash-devtool (a shell script) and a mock siteverify.

use std::collections::HashSet;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

use axum::body::{Body, to_bytes};
use axum::http::Request;
use serde_json::Value;
use tower::ServiceExt;

use super::*;

const APP: &str = "https://app.zpredict.site";
const ESCROW: &str = "utest1escrow";
const TXID: &str = "ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12";
const BITS: u32 = 4;

/// devtool stand-in: `wallet -w <dir> <cmd> …`; `pay` logs its arguments to <dir>/pay.log.
const FAKE: &str = r#"#!/bin/sh
dir=$3
case $4 in
  balance) echo '{"total":500000000,"sapling_spendable":0,"orchard_spendable":0,"ironwood_spendable":500000000,"transparent_spendable":0,"chain_tip_height":7}' ;;
  list-tx) echo '[]' ;;
  pay) echo "$@" >>"$dir/pay.log"; echo "Creating transaction..."; echo TXID ;;
esac
"#;

fn scratch() -> PathBuf {
    let mut b = [0u8; 8];
    getrandom::fill(&mut b).unwrap();
    let d = std::env::temp_dir().join(format!("zpredict-faucet-{}", hex::encode(b)));
    std::fs::create_dir_all(&d).unwrap();
    let bin = d.join("devtool");
    std::fs::write(&bin, FAKE.replace("TXID", TXID)).unwrap();
    std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
    d
}

/// Cloudflare stand-in: token `ok:<cdata>` succeeds once with that cdata, anything else fails.
async fn siteverify() -> String {
    let seen = Arc::new(Mutex::new(HashSet::<String>::new()));
    let app = Router::new().route(
        "/",
        post(move |Json(b): Json<Value>| {
            let seen = seen.clone();
            async move {
                assert!(b.get("remoteip").is_none(), "no caller IP is forwarded");
                assert_eq!(b["secret"], "s3cret");
                let t = b["response"].as_str().unwrap_or_default().to_owned();
                let fresh = seen.lock().unwrap().insert(t.clone());
                match t.strip_prefix("ok:") {
                    Some(cdata) if fresh => Json(json!({ "success": true, "cdata": cdata })),
                    _ => Json(json!({ "success": false, "error-codes": ["timeout-or-duplicate"] })),
                }
            }
        }),
    );
    let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/", l.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(l, app).await.unwrap() });
    url
}

async fn faucet() -> (Shared, PathBuf) {
    let d = scratch();
    let f = Arc::new(Faucet {
        devtool: Devtool {
            bin: d.join("devtool"),
            wallet: d.clone(),
            identity: d.join("age.txt"),
            server: "lwd".into(),
        },
        escrow: ESCROW.into(),
        origins: vec![APP.into()],
        app_url: format!("{APP}/faucet/"),
        pow: Pow::new(BITS),
        turnstile: Some(Turnstile::new("s3cret".into(), siteverify().await)),
        limit: Mutex::new(Limiter::new(30, 100)),
        cache: Mutex::default(),
        wallet: tokio::sync::Mutex::new(()),
    });
    refresh(&f).await.unwrap();
    (f, d)
}

async fn call(f: &Shared, method: &str, uri: &str, body: Value) -> (StatusCode, Value, Response) {
    let req = Request::builder()
        .method(method)
        .uri(uri)
        .header("origin", APP)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    let res = router(f.clone()).oneshot(req).await.unwrap();
    let (parts, body) = res.into_parts();
    let bytes = to_bytes(body, 1 << 16).await.unwrap();
    let v = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (parts.status, v, Response::from_parts(parts, Body::empty()))
}

fn a_memo() -> String {
    let raw = include_str!("../../../packages/settle/testdata/memo-vectors.json");
    let v: Value = serde_json::from_str(raw).unwrap();
    v["memos"][0]["uriMemo"].as_str().unwrap().to_owned()
}

/// A drip body with a fresh challenge solved for `memo` and the given Turnstile token
/// (`{c}` is replaced by the challenge).
async fn solved(f: &Shared, memo_param: &str, token: &str) -> Value {
    let (_, c, _) = call(f, "POST", "/challenge", Value::Null).await;
    let c = c["challenge"].as_str().unwrap().to_owned();
    let nonce = crate::pow::solve(&c, &memo::parse(memo_param).unwrap(), BITS);
    json!({ "memo": memo_param, "pow": { "challenge": c, "nonce": nonce }, "turnstile": token.replace("{c}", &c) })
}

#[tokio::test]
async fn status_headers_and_cors() {
    let (f, _) = faucet().await;
    let (code, v, res) = call(&f, "GET", "/status", Value::Null).await;
    assert_eq!(code, StatusCode::OK);
    assert_eq!(v["enabled"], true);
    assert_eq!(v["balance"], 500_000_000);
    assert_eq!(v["drop"], 5_000_000);
    assert_eq!(v["turnstile"], true);
    let h = res.headers();
    assert_eq!(h[header::ACCESS_CONTROL_ALLOW_ORIGIN], APP);
    assert!(
        h[header::CONTENT_SECURITY_POLICY]
            .to_str()
            .unwrap()
            .starts_with("default-src 'none'")
    );
    assert_eq!(h[header::CACHE_CONTROL], "no-store");

    let req = Request::builder()
        .uri("/status")
        .header("origin", "https://evil.example")
        .body(Body::empty())
        .unwrap();
    let res = router(f.clone()).oneshot(req).await.unwrap();
    assert!(
        res.headers()
            .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
            .is_none()
    );
}

#[tokio::test]
async fn drip_pays_the_escrow_once_per_interval() {
    let (f, d) = faucet().await;
    let memo_param = a_memo();
    let body = solved(&f, &memo_param, "ok:{c}").await;
    let (code, v, _) = call(&f, "POST", "/drip", body).await;
    assert_eq!(code, StatusCode::OK, "{v}");
    assert_eq!(v["txid"], TXID);
    let log = std::fs::read_to_string(d.join("pay.log")).unwrap();
    let uri = format!("zcash:{ESCROW}?amount=0.05000000&memo={memo_param}");
    assert!(log.contains(&uri), "{log}");
    assert!(log.contains("--disable-confirmation"));

    let (_, s, _) = call(&f, "GET", &format!("/status?tx={TXID}"), Value::Null).await;
    assert_eq!(s["tx"], json!({ "known": true, "mined": null }));
    assert!(s["nextDrop"].as_u64().unwrap() > 0);

    let body = solved(&f, &memo_param, "ok:{c}").await;
    let (code, v, _) = call(&f, "POST", "/drip", body).await;
    assert_eq!(code, StatusCode::TOO_MANY_REQUESTS);
    assert!(v["retryAfter"].as_u64().unwrap() > 0);
}

#[tokio::test]
async fn turnstile_failure_wrong_challenge_and_reuse() {
    let (f, d) = faucet().await;
    let m = a_memo();
    for token in ["bad", "", "ok:not-this-challenge"] {
        let (code, v, _) = call(&f, "POST", "/drip", solved(&f, &m, token).await).await;
        assert_eq!(code, StatusCode::FORBIDDEN, "{token}: {v}");
    }
    // Cloudflare accepts a token once: a replay fails even for its own challenge.
    let ts = f.turnstile.as_ref().unwrap();
    assert!(ts.verify("ok:abc", "abc").await);
    assert!(!ts.verify("ok:abc", "abc").await);
    assert!(!d.join("pay.log").exists(), "nothing was paid");
}

#[tokio::test]
async fn rejects_bad_memo_and_weak_pow() {
    let (f, d) = faucet().await;
    let (code, _, _) = call(
        &f,
        "POST",
        "/drip",
        json!({ "memo": "AAAA", "pow": { "challenge": "00", "nonce": 0 } }),
    )
    .await;
    assert_eq!(code, StatusCode::BAD_REQUEST);
    let mut body = solved(&f, &a_memo(), "ok:{c}").await;
    let n = body["pow"]["nonce"].as_u64().unwrap();
    // The first failing nonce after the solution.
    let c = body["pow"]["challenge"].as_str().unwrap().to_owned();
    let m = memo::parse(&a_memo()).unwrap();
    let weak = (n + 1..)
        .find(|&k| crate::pow::digest(&hex::decode(&c).unwrap(), &m, k)[0] >> (8 - BITS) != 0)
        .unwrap();
    body["pow"]["nonce"] = json!(weak);
    let (code, v, _) = call(&f, "POST", "/drip", body).await;
    assert_eq!(code, StatusCode::FORBIDDEN);
    assert_eq!(v["error"], "proof of work too weak");
    assert!(!d.join("pay.log").exists());
}

#[tokio::test]
async fn landing_is_static_and_self_only() {
    let (f, _) = faucet().await;
    let req = Request::builder().uri("/").body(Body::empty()).unwrap();
    let res = router(f.clone()).oneshot(req).await.unwrap();
    let csp = res.headers()[header::CONTENT_SECURITY_POLICY]
        .to_str()
        .unwrap()
        .to_owned();
    assert!(!csp.contains("script-src") && csp.contains("default-src 'none'"));
    let html =
        String::from_utf8(to_bytes(res.into_body(), 1 << 16).await.unwrap().to_vec()).unwrap();
    assert!(html.contains("5.00000000 TAZ") && html.contains("https://app.zpredict.site/faucet/"));
    assert!(!html.contains("<script"), "no scripts on the landing");
}
