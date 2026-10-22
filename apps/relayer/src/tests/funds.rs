//! Balance table: collateral checks, top-up rows, and the real MPC end to end.

use zpredict_core::{clear, fill_records};

use super::*;
use crate::mpc::{InsecureLocalMatcher, Polytune};

#[tokio::test(flavor = "multi_thread")]
async fn unfunded_orders_never_fill_and_top_ups_get_new_rows() {
    let r = relayers("funds", 4, || InsecureLocalMatcher, false);
    let ((ta, a), (_, b)) = (funded(&r).await, funded(&r).await);
    // YES 99 × 26 needs 5148 > 5000: a dummy, so NO finds no counterparty.
    submit(&r, &id(1), order(1, Side::Yes, 99, 26, a), &[0, 1, 2]).await;
    submit(&r, &id(2), order(1, Side::No, 50, 1, b), &[0, 1, 2]).await;
    batch_all(&r).await;
    assert_eq!(fill(&r, &id(1)).await, Some([0; FILL_LEN]));
    assert_eq!(balance(&r, &ta).await, 5000);
    // Account a's row went through MPC, so a credit to it starts a new row.
    r[0].batcher.state.lock().unwrap().credit(&ta, 100).unwrap();
    assert_eq!(
        r[0].batcher.state.lock().unwrap().table.ids(),
        vec![a, b, a]
    );
    batch_all(&r).await;
    assert_eq!(
        r[2].batcher.state.lock().unwrap().table.ids(),
        vec![a, b, a]
    );
}

/// The real polytune MPC (with balance checks) over our Noise channel. ~1 min even
/// with opt-level 3: `cargo test -p zpredict-relayer -- --ignored`.
#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn three_relayers_real_mpc() {
    let _ = zpredict_circuit::program();
    let r = relayers("mpc", zpredict_circuit::N, || Polytune, false);
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
}
