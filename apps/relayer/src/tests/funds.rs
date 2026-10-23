//! Balance table: collateral checks, top-ups, and the real MPC end to end.

use zpredict_core::{clear, fill_records};

use super::*;
use crate::mpc::{InsecureLocalMatcher, Polytune};

#[tokio::test(flavor = "multi_thread")]
async fn unfunded_orders_never_fill_and_top_ups_land_in_the_same_row() {
    let r = relayers("funds", 4, || InsecureLocalMatcher, false);
    let (a, b) = (funded(&r).await, funded(&r).await);
    // YES 99 × 26 needs 5148 > 5000: a dummy, so NO finds no counterparty.
    submit(&r, &id(1), order(1, Side::Yes, 99, 26, a), &[0, 1, 2]).await;
    submit(&r, &id(2), order(1, Side::No, 50, 1, b), &[0, 1, 2]).await;
    batch_all(&r).await;
    assert_eq!(fill(&r, &id(1)).await, Some([0; FILL_LEN]));
    assert_eq!(balance(&r, &a).await, 5000);
    // Account a's row went through MPC, so its top-up is a public credit for the next
    // batch, which runs even with no orders. No second row.
    let ids = vec![account_id(&a), account_id(&b)];
    let top_up = crate::store::Event::Credit {
        id: ids[0],
        amount: 100,
    };
    r[0].batcher.state.lock().unwrap().record(top_up).unwrap();
    batch_all(&r).await;
    assert_eq!(balance(&r, &a).await, 5100);
    for x in &r {
        assert_eq!(x.batcher.state.lock().unwrap().table.ids(), ids);
    }
}

/// The real polytune MPC (with balance checks) over our Noise channel. ~1 min even
/// with opt-level 3: `cargo test -p zpredict-relayer -- --ignored`.
#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn three_relayers_real_mpc() {
    let w = zpredict_circuit::DEFAULT_WITHDRAWALS;
    let _ = zpredict_circuit::program(8, 16, zpredict_circuit::DEFAULT_MARKETS, w);
    let r = relayers("mpc", 8, || Polytune, false);
    let (a, b) = (funded(&r).await, funded(&r).await);
    let (yes, no) = (order(1, Side::Yes, 60, 3, a), order(1, Side::No, 45, 2, b));
    submit(&r, &id(1), yes, &[0, 1, 2]).await;
    submit(&r, &id(2), no, &[0, 1, 2]).await;
    assert_eq!(batch_all(&r).await[0], [id(1), id(2)]);
    // That batch preprocessed inline, then all three preprocessed the next run.
    let held = |x: &Relayer<Polytune>| x.batcher.pre.lock().unwrap().as_ref().map(|p| p.0);
    let first = held(&r[0]);
    assert!(first.is_some() && r.iter().all(|x| held(x) == first));
    let want = fill_records(&[yes, no], &clear(&[yes, no]));
    assert_eq!(fill(&r, &id(1)).await, Some(want[0]));
    assert_eq!(fill(&r, &id(2)).await, Some(want[1]));
    assert_eq!(
        (balance(&r, &a).await, balance(&r, &b).await),
        (5000 - 230, 5000 - 170)
    );
    // The circuit's public price reaches every relayer's lastPrice: 115 half-ticks.
    for x in &r {
        let (_, m) = call(&x.http, "GET", "/markets", None).await;
        assert_eq!(m[0]["lastPrice"], json!(57.5));
    }

    // Market 1 resolves YES on every node: the resolution MPC pays a's 2 contracts.
    for x in &r {
        let mut s = x.batcher.state.lock().unwrap();
        s.markets[0].status = zpredict_oracle::Status::Resolved;
        s.markets[0].outcome = Some(zpredict_oracle::Outcome::Yes);
    }
    batch_all(&r).await;
    assert_eq!(balance(&r, &a).await, 5000 - 230 + 400);

    // b, a judge-mode account, asks to withdraw 1000 through the clearing MPC (its key only
    // as fresh XOR shares): the circuit refuses mock credit (#104), so nothing moves.
    let shares = fresh_shares(&b);
    for (i, x) in r.iter().enumerate() {
        let e = crate::store::Event::Withdrawal {
            id: id(9),
            share: hex::encode(shares[i]),
            amount: 1000,
            address: "ua".into(),
        };
        x.batcher.state.lock().unwrap().record(e).unwrap();
    }
    batch_all(&r).await; // on the run held since the first batch
    assert_eq!(balance(&r, &b).await, 5000 - 170);
    let status = r[0]
        .batcher
        .state
        .lock()
        .unwrap()
        .ledger
        .withdrawal(&id(9))
        .map(|w| w.status);
    assert_eq!(status, Some(crate::ledger::WithdrawalStatus::Refused));
    let next = held(&r[0]);
    assert!(next.is_some() && next != first, "used, then replaced");
}
