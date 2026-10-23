//! Batch membership, cross-market isolation, expiry, restart, padding, peer keys.

use serde_json::Value;
use zpredict_core::{clear, fill_records};

use super::*;
use crate::mpc::InsecureLocalMatcher;
use crate::state::{Shared, State, Status};

/// Also regression #49: an order in another market never crosses (order 3).
#[tokio::test(flavor = "multi_thread")]
async fn three_relayers_clear_expire_and_restart() {
    let r = relayers("e2e", 4, || InsecureLocalMatcher, false);
    let (a, b) = (funded(&r).await, funded(&r).await);
    let (yes, no) = (order(1, Side::Yes, 60, 3, a), order(1, Side::No, 45, 3, b));
    let other = order(2, Side::No, 99, 3, b); // other market: must not cross
    submit(&r, &id(1), yes, &[0, 1, 2]).await;
    submit(&r, &id(2), no, &[0, 1, 2]).await;
    submit(&r, &id(3), other, &[0, 1, 2]).await;
    submit(&r, &id(4), yes, &[0, 2]).await; // relayer 1 never got its share

    let ids = batch_all(&r).await;
    assert!(
        ids.iter().all(|x| *x == [id(1), id(2), id(3)]),
        "intersection, sorted"
    );
    let want = fill_records(&[yes, no], &clear(&[yes, no]));
    assert_eq!(fill(&r, &id(1)).await, Some(want[0]));
    assert_eq!(fill(&r, &id(2)).await, Some(want[1]));
    assert_eq!(
        fill(&r, &id(3)).await,
        Some([0; FILL_LEN]),
        "no cross-market fill"
    );
    // Each account paid its fill's actual cost; relayers 1 and 2 adopted both rows.
    assert_eq!(
        (balance(&r, &a).await, balance(&r, &b).await),
        (5000 - 345, 5000 - 255)
    );
    for x in &r {
        let ids = vec![account_id(&a), account_id(&b)];
        assert_eq!(x.batcher.state.lock().unwrap().table.ids(), ids);
        let (_, m) = call(&x.http, "GET", "/markets", None).await;
        assert_eq!(
            (m[0]["lastPrice"].clone(), m[1].get("lastPrice")),
            (json!(57.5), None)
        );
        let (_, h) = call(&x.http, "GET", "/health", None).await;
        assert_eq!(
            (h["batch"].clone(), h["peers"].clone()),
            (json!(2), json!([true, true, true]))
        );
    }
    let path = |i| format!("/orders/{}?token={}", id(4), token(i));
    let (_, s) = call(&r[0].http, "GET", &path(0), None).await;
    assert_eq!(s, json!({"status": "pending"}));

    // Next batch: order 4 is a batch old and still missing a share, so it expires.
    batch_all(&r).await;
    for i in [0, 2] {
        let (_, s) = call(&r[i].http, "GET", &path(i), None).await;
        assert_eq!(s, json!({"status": "unfilled"}));
    }

    // Restart relayers 0 and 1 from their event logs: same shares, statuses, table, view.
    for i in [0, 1] {
        let before = snapshot(&r[i].batcher.state, account_id(&a));
        let dir = std::env::temp_dir().join(format!("zpredict-e2e-{i}-{}", std::process::id()));
        let markets = r[i].batcher.state.lock().unwrap().markets.clone();
        let reopened = State::open(i, markets, &dir).unwrap().shared();
        assert_eq!(snapshot(&reopened, account_id(&a)), before);
    }
}

fn snapshot(s: &Shared, account: u64) -> Value {
    let s = s.lock().unwrap();
    let status = |n| match s.order(&id(n)).map(|o| o.status) {
        Some(Status::Filled(f)) => hex::encode(f),
        other => format!("{other:?}"),
    };
    let view = serde_json::to_value(s.view_after(0, 1000)).unwrap();
    // No `batch`: an idle window bumps it only in memory; peers resync it via the max.
    json!({"orders":[status(1), status(2), status(3), status(4)],
        "balance": s.table.balance_share(account), "rows": s.table.ids(), "view": view,
        "keys": s.table.key_shares(2, 2),
        "positions": s.positions().len()})
}

fn held<M: Matcher>(r: &[Relayer<M>]) -> Vec<Option<u64>> {
    let id = |x: &Relayer<M>| x.batcher.pre.lock().unwrap().as_ref().map(|p| p.0);
    r.iter().map(id).collect()
}

/// A preprocessed run is used only if all three hold the same one; otherwise each drops
/// its own, the batch preprocesses inline, and they all hold the same next one.
#[tokio::test(flavor = "multi_thread")]
async fn preprocessed_runs_are_used_only_when_all_three_agree() {
    let r = relayers("pre", 2, || InsecureLocalMatcher, false);
    batch_all(&r).await; // idle: nothing held yet, so all three preprocess
    let first = held(&r);
    assert!(first[0].is_some() && first.iter().all(|h| *h == first[0]));
    batch_all(&r).await;
    assert_eq!(held(&r), first, "an idle window keeps the held run");
    *r[2].batcher.pre.lock().unwrap() = Some((999, ()));
    submit(&r, &id(1), order(1, Side::Yes, 50, 1, [7; 16]), &[0, 1, 2]).await;
    assert_eq!(batch_all(&r).await[0], [id(1)], "mismatch: cleared inline");
    let next = held(&r);
    assert!(next[0].is_some() && next[0] != first[0]);
    assert!(next.iter().all(|h| *h == next[0]));
}

#[tokio::test(flavor = "multi_thread")]
async fn batches_cap_at_slots_and_pad() {
    let r = relayers("cap", 2, || InsecureLocalMatcher, false);
    for n in 1..=3 {
        submit(&r, &id(n), order(1, Side::Yes, 50, 1, [7; 16]), &[0, 1, 2]).await;
    }
    assert_eq!(batch_all(&r).await[0], [id(1), id(2)]);
    assert_eq!(
        batch_all(&r).await[0],
        [id(3)],
        "overflow waits, never expires"
    );
    assert_eq!(
        fill(&r, &id(3)).await,
        Some([0; FILL_LEN]),
        "padding never crosses"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn wrong_peer_key_never_links() {
    let r = relayers("badkey", 4, || InsecureLocalMatcher, true);
    let (a, _, c) = tokio::join!(
        r[0].batcher.once(),
        r[1].batcher.once(),
        r[2].batcher.once()
    );
    assert!(a.is_err() && c.is_err());
    assert!(!r[0].batcher.state.lock().unwrap().peers[2]);
}
