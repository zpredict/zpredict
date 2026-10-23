//! `POST /withdrawals` and `GET /withdrawals/{id}` (only with `[settlement]` on).
//!
//! The browser sends the same request to all three relayers, each with its own fresh
//! XOR share of the account key: no relayer learns whose withdrawal it is, and none can
//! forge one (the circuit pays only if the shares rebuild a row's key). Amount and address
//! are public (the payout needs them). The circuit takes the amount only if the account
//! covers it; then relayer 0 and 1 sign one batched payout.

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;
use zpredict_settle::Payout;

use super::{Api, fail, is_hex};
use crate::ledger::WITHDRAWAL_FEE;
use crate::store::Event;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WithdrawalPost {
    withdrawal_id: String,
    share: String,
    amount: u64,
    address: String,
}

/// `{withdrawalId: hex32, share: hex32, amount: half-ticks, address: unified address}`
/// → `202 {}`. The address must carry an Orchard-shaped receiver for the escrow's
/// network; the amount must exceed the fee ([`WITHDRAWAL_FEE`] half-ticks, kept).
pub async fn post(State(api): State<Api>, body: Bytes) -> Response {
    let Some(escrow) = api.escrow.as_ref() else {
        return fail(StatusCode::NOT_FOUND, "not found");
    };
    let bad = |m| fail(StatusCode::BAD_REQUEST, m);
    let Ok(b) = serde_json::from_slice::<WithdrawalPost>(&body) else {
        return bad("bad withdrawal");
    };
    if !is_hex(&b.withdrawal_id, 32) || !is_hex(&b.share, 32) {
        return bad("bad withdrawal");
    }
    if b.amount <= WITHDRAWAL_FEE || b.amount > u64::MAX / crate::ledger::ZATS_PER_HALF_TICK {
        return bad("amount must exceed the fee");
    }
    let zats = (b.amount - WITHDRAWAL_FEE) * crate::ledger::ZATS_PER_HALF_TICK;
    if Payout::parse(&escrow.params, &b.address, zats).is_err() {
        return bad("address must be a unified address with an Orchard receiver");
    }
    let mut s = api.state.lock().expect("state lock");
    if s.ledger.withdrawal(&b.withdrawal_id).is_some() {
        return fail(StatusCode::CONFLICT, "duplicate");
    }
    let event = Event::Withdrawal {
        id: b.withdrawal_id,
        share: b.share,
        amount: b.amount,
        address: b.address,
    };
    match s.record(event) {
        Ok(()) => (StatusCode::ACCEPTED, Json(json!({}))).into_response(),
        Err(_) => fail(StatusCode::INTERNAL_SERVER_ERROR, "store failed"),
    }
}

/// `{status: pending|refused|debited|paying|paid, txid?, payout?: "retrying"}`. A request
/// from a judge-mode account is `refused` like one its balance doesn't cover: the circuit
/// never debits mock credit, and no relayer learns whose request it was.
pub async fn get(State(api): State<Api>, Path(id): Path<String>) -> Response {
    let s = api.state.lock().expect("state lock");
    let Some(w) = s.ledger.withdrawal(&id).filter(|_| is_hex(&id, 32)) else {
        return fail(StatusCode::NOT_FOUND, "unknown withdrawal");
    };
    let mut body = json!({ "status": w.status });
    if let Some(txid) = &w.txid {
        body["txid"] = json!(txid);
    }
    if w.status == crate::ledger::WithdrawalStatus::Debited && s.payout_retrying {
        body["payout"] = json!("retrying"); // the escrow payout failed; retried with backoff
    }
    Json(body).into_response()
}
