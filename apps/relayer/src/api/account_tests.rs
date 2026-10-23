//! Accounts and judge claims: keyed balance reads, seats, claim retries and the cap.

use axum::http::StatusCode;
use serde_json::json;

use super::tests::{app, call};
use crate::store::Event;

/// Regression #99 (PR #101): a judge claim on a full table is `503`, a retried claim is
/// `200` with no second credit, and an account past the cap reads `waiting`, never a
/// silent dummy.
#[tokio::test]
async fn accounts_and_judge_claims() {
    let (app, state) = app(0, "api-accounts", true);
    let (id, share) = ("07".repeat(8), "5a".repeat(16));
    let claim = json!({"account": id, "keyShare": share});
    let (code, _) = call(&app, "POST", "/judge/claim", Some(claim.clone())).await;
    assert_eq!(code, StatusCode::OK);
    let again = call(&app, "POST", "/judge/claim", Some(claim)).await.0;
    assert_eq!(
        again,
        StatusCode::OK,
        "a retried claim is fine, and credits nothing"
    );
    let swap = json!({"account": id, "keyShare": "5b".repeat(16)});
    let swap = call(&app, "POST", "/judge/claim", Some(swap)).await.0;
    assert_eq!(swap, StatusCode::CONFLICT, "no key swap");
    let get = |id: &str, key: &str| {
        let (app, path) = (app.clone(), format!("/accounts/{id}?key={key}"));
        async move { call(&app, "GET", &path, None).await }
    };
    let (_, acct) = get(&id, &share).await;
    assert_eq!(
        acct,
        json!({"balanceShare": hex::encode(5000u64.to_le_bytes()), "seat": "seated", "mock": true})
    );
    // Without this relayer's key share nobody reads the account's balance share.
    assert_eq!(get(&id, &"5b".repeat(16)).await.0, StatusCode::FORBIDDEN);
    let (_, zero) = get(&"ab".repeat(8), &share).await;
    assert_eq!(
        zero,
        json!({"balanceShare": "0000000000000000", "seat": "none", "mock": false})
    );
    // This test table holds 2 rows: the second claim fills it, a third is refused.
    let second = json!({"account": "08".repeat(8), "keyShare": share});
    let third = json!({"account": "09".repeat(8), "keyShare": share});
    let code = |b| {
        let app = app.clone();
        async move { call(&app, "POST", "/judge/claim", Some(b)).await.0 }
    };
    assert_eq!(code(second).await, StatusCode::OK);
    assert_eq!(code(third).await, StatusCode::SERVICE_UNAVAILABLE);
    // A deposit still opens a row past the cap: its owner learns it waits for one.
    let late = u64::from_le_bytes([0x0a; 8]);
    {
        let mut s = state.lock().unwrap();
        let share = share.clone();
        s.record(Event::Key { id: late, share }).unwrap();
        s.record(Event::Credit {
            id: late,
            amount: 200,
        })
        .unwrap();
    }
    let (_, waiting) = get(&"0a".repeat(8), &share).await;
    assert_eq!(waiting["seat"], "waiting");
    assert_eq!(get("xyz", &share).await.0, StatusCode::NOT_FOUND);
    assert_eq!(
        call(&app, "GET", &format!("/accounts/{id}"), None).await.0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn judge_claims_register_keys_and_only_relayer_zero_credits() {
    let claim = json!({"account": "01".repeat(8), "keyShare": "02".repeat(16)});
    let (off, _) = app(0, "api-judge-off", false);
    assert_eq!(
        call(&off, "POST", "/judge/claim", Some(claim.clone()))
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    let (r1, state) = app(1, "api-judge-r1", true);
    assert_eq!(
        call(&r1, "POST", "/judge/claim", Some(claim)).await.0,
        StatusCode::OK
    );
    let registered = {
        let s = state.lock().unwrap();
        let id = u64::from_le_bytes([1; 8]);
        s.table.key_matches(id, &[2; 16]) && s.table.ids().is_empty()
    };
    assert!(
        registered,
        "relayer 1 registers the key, relayer 0 owns rows"
    );
    let bad = json!({"account": "01".repeat(8), "keyShare": "02"});
    assert_eq!(
        call(&r1, "POST", "/judge/claim", Some(bad)).await.0,
        StatusCode::BAD_REQUEST
    );
}
