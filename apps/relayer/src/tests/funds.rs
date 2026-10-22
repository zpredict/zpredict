//! Balance table: collateral checks, top-ups, and the real MPC end to end.

use zpredict_core::{clear, fill_records};

use super::*;
use crate::mpc::{InsecureLocalMatcher, Polytune};

#[tokio::test(flavor = "multi_thread")]
async fn unfunded_orders_never_fill_and_top_ups_land_in_the_same_row() {
    let r = relayers("funds", 4, || InsecureLocalMatcher, false);
    let ((ta, a), (_, b)) = (funded(&r).await, funded(&r).await);
    // YES 99 × 26 needs 5148 > 5000: a dummy, so NO finds no counterparty.
    submit(&r, &id(1), order(1, Side::Yes, 99, 26, a), &[0, 1, 2]).await;
    submit(&r, &id(2), order(1, Side::No, 50, 1, b), &[0, 1, 2]).await;
    batch_all(&r).await;
    assert_eq!(fill(&r, &id(1)).await, Some([0; FILL_LEN]));
    assert_eq!(balance(&r, &ta).await, 5000);
    // Account a's row went through MPC, so its top-up is a public credit for the next
    // batch, which runs even with no orders. No second row.
    r[0].batcher.state.lock().unwrap().credit(&ta, 100).unwrap();
    batch_all(&r).await;
    assert_eq!(balance(&r, &ta).await, 5100);
    for x in &r {
        assert_eq!(x.batcher.state.lock().unwrap().table.ids(), vec![a, b]);
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
    let ((ta, a), (tb, b)) = (funded(&r).await, funded(&r).await);
    let (yes, no) = (order(1, Side::Yes, 60, 3, a), order(1, Side::No, 45, 2, b));
    submit(&r, &id(1), yes, &[0, 1, 2]).await;
    submit(&r, &id(2), no, &[0, 1, 2]).await;
    assert_eq!(batch_all(&r).await[0], [id(1), id(2)]);
    let want = fill_records(&[yes, no], &clear(&[yes, no]));
    assert_eq!(fill(&r, &id(1)).await, Some(want[0]));
    assert_eq!(fill(&r, &id(2)).await, Some(want[1]));
    assert_eq!(
        (balance(&r, &ta).await, balance(&r, &tb).await),
        (5000 - 230, 5000 - 170)
    );
    // The circuit's public price reaches every relayer's lastPrice: 115 half-ticks.
    for x in &r {
        let (_, m) = call(&x.http, "GET", "/markets", None).await;
        assert_eq!(m[0]["lastPrice"], json!(57.5));
    }
}
