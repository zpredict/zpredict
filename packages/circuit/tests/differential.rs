//! The circuit against `zpredict_core::clear` on seeded random batches.

use zpredict_circuit::{
    eval_in_clear,
    harness::{Rng, combine, expected, random_batch, run_local},
};

/// The circuit's logic, evaluated in the clear: many batches, fast.
#[test]
fn circuit_matches_clear() {
    let mut rng = Rng(0x2026_1028);
    let mut filled = 0;
    for round in 0..300 {
        let batch = random_batch(&mut rng);
        let want = expected(&batch.orders);
        assert_eq!(eval_in_clear(&batch.shares).unwrap(), want, "round {round}");
        filled += want.iter().filter(|r| r[9] == 1).count();
    }
    assert!(
        filled > 300 * 3,
        "batches must actually cross ({filled} fills)"
    );
}

/// The full 3-party MPC over localhost TCP: shares combine to `clear`'s records.
#[tokio::test(flavor = "multi_thread")]
async fn three_parties_match_clear() {
    let mut rng = Rng(7);
    for port in [7100, 7110] {
        let batch = random_batch(&mut rng);
        let shares = run_local(&batch.shares, port).await.unwrap();
        let want = expected(&batch.orders);
        assert_eq!(combine(&shares), want);
        for s in &shares {
            assert_ne!(s, &want, "no single relayer holds the records");
        }
    }
}
