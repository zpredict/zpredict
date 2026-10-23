//! `POST /withdrawals` and `GET /withdrawals/{id}`: what the browser may send, and the
//! statuses it reads back.

use std::sync::Arc;

use axum::http::StatusCode;
use serde_json::json;

use super::tests::{app, call};
use super::{Api, router};
use crate::escrow::Escrow;
use crate::ledger::WithdrawalStatus;
use crate::store::Event;

#[tokio::test]
async fn withdrawals_contract() {
    let (off, state) = app(0, "api-withdrawals", false);
    let shares = zpredict_settle::dkg_local().unwrap();
    let ak = shares[0].ak().unwrap();
    let fvk = zpredict_settle::keys::fvk_from_ak(&ak).unwrap();
    let ua = zpredict_settle::escrow_keys(&ak, "regtest")
        .unwrap()
        .address;
    let main = zpredict_settle::escrow_keys(&ak, "main").unwrap().address;
    let on = router(Api {
        state: state.clone(),
        origin: "http://localhost:3000".into(),
        table_rows: 2,
        judge_credit: None,
        memo_key: None,
        group_key: None,
        escrow: Some(Arc::new(Escrow::for_tests(
            0,
            shares.into_iter().next().unwrap(),
            fvk,
        ))),
        references: Default::default(),
    });
    let (id, share) = ("ab".repeat(16), "5a".repeat(16));
    let body = |amount: u64, address: &str| json!({"withdrawalId": id, "share": share, "amount": amount, "address": address});
    let post = |b| {
        let on = on.clone();
        async move { call(&on, "POST", "/withdrawals", Some(b)).await.0 }
    };
    assert_eq!(
        call(&off, "POST", "/withdrawals", Some(body(1000, &ua)))
            .await
            .0,
        StatusCode::NOT_FOUND,
        "settlement off: no withdrawals"
    );
    for bad in [
        body(2, &ua),      // the fee alone
        body(1000, &main), // another network
        body(1000, "tmXYZ"),
        body(u64::MAX, &ua),
        json!({"withdrawalId": id.to_uppercase(), "share": share, "amount": 1000, "address": ua}),
        json!({"withdrawalId": id, "share": &share[2..], "amount": 1000, "address": ua}),
        json!({"withdrawalId": id, "share": share, "amount": -1, "address": ua}),
        json!({"withdrawalId": id, "share": share, "amount": 1000, "address": ua, "x": 1}),
    ] {
        assert_eq!(post(bad.clone()).await, StatusCode::BAD_REQUEST, "{bad}");
    }
    assert_eq!(post(body(1000, &ua)).await, StatusCode::ACCEPTED);
    assert_eq!(
        post(body(1000, &ua)).await,
        StatusCode::CONFLICT,
        "one per id"
    );

    let get = |path: String| {
        let on = on.clone();
        async move { call(&on, "GET", &path, None).await }
    };
    let path = format!("/withdrawals/{id}");
    assert_eq!(get(path.clone()).await.1, json!({"status": "pending"}));
    assert_eq!(
        get(format!("/withdrawals/{}", "cd".repeat(16))).await.0,
        StatusCode::NOT_FOUND
    );
    let paid = Event::Payout {
        ids: vec![id.clone()],
        status: WithdrawalStatus::Paid,
        txid: Some("ee".repeat(32)),
    };
    {
        let mut s = state.lock().unwrap();
        let w = s.ledger.withdrawal(&id).unwrap();
        assert_eq!((w.amount, w.status), (1000, WithdrawalStatus::Pending));
        s.record(paid).unwrap();
    }
    let want = json!({"status": "paid", "txid": "ee".repeat(32)});
    assert_eq!(get(path).await.1, want);
}
