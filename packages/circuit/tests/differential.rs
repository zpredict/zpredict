//! The circuit against `zpredict_core::clear_with_balances` on seeded random batches.

use zpredict_circuit::{
    eval_in_clear,
    harness::{Rng, combine, expected, random_batch, run_local},
};
use zpredict_core::{Order, Side, clear, fill_records};

/// Fill records with no balance checks at all, to see that balances changed something.
fn unchecked(orders: &[[u8; 18]]) -> Vec<[u8; 10]> {
    let dummy = Order {
        market: 0,
        side: Side::Yes,
        price: 1,
        size: 0,
        account: 0,
    };
    let batch: Vec<Order> = orders
        .iter()
        .map(|b| Order::decode(b).unwrap_or(dummy))
        .collect();
    fill_records(&batch, &clear(&batch))
}

/// The circuit's logic, evaluated in the clear: many batches, fast.
#[test]
fn circuit_matches_clear_with_balances() {
    let mut rng = Rng(0x2026_1028);
    let (mut filled, mut debited, mut refused) = (0, 0, 0);
    for round in 0..300 {
        let batch = random_batch(&mut rng);
        let want = expected(&batch);
        let got = eval_in_clear(&batch.order_shares, &batch.account_shares).unwrap();
        assert_eq!(got, want, "round {round}");
        filled += want.fills.iter().filter(|r| r[9] == 1).count();
        debited += (0..batch.accounts.len())
            .filter(|&m| u64::from_le_bytes(want.balances[m]) != batch.accounts[m].balance)
            .count();
        refused += usize::from(unchecked(&batch.orders) != want.fills);
    }
    // The generator must exercise crossing, debits, and orders refused for lack of funds.
    assert!(filled > 300 * 2, "too few fills: {filled}");
    assert!(debited > 300, "too few debits: {debited}");
    assert!(refused > 100, "balances changed too few batches: {refused}");
}

/// The full 3-party MPC over localhost TCP: shares combine to the reference.
#[tokio::test(flavor = "multi_thread")]
async fn three_parties_match_clear_with_balances() {
    let mut rng = Rng(7);
    for port in [7100, 7110] {
        let batch = random_batch(&mut rng);
        let shares = run_local(&batch, port).await.unwrap();
        let want = expected(&batch);
        assert_eq!(combine(&shares), want);
        for s in &shares {
            assert_ne!(s, &want, "no single relayer holds the result");
        }
    }
}
