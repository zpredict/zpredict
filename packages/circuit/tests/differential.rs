//! The circuit against `zpredict_core::clear_with_balances` on seeded random batches.

use zpredict_circuit::{
    Outcome, eval_in_clear,
    harness::{Batch, MARKET, Rng, combine, expected, random_batch, run_local},
};
use zpredict_core::{Order, Side, clear, fill_records};

/// Fill records with no market or balance checks, to see that those checks mattered.
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

fn eval(b: &Batch, markets: [u32; 3]) -> Outcome {
    let orders = [0, 1, 2].map(|p| b.order_shares[p].as_slice());
    let accounts = [0, 1, 2].map(|p| b.account_shares[p].as_slice());
    eval_in_clear(markets, orders, accounts).unwrap()
}

/// The circuit's logic, evaluated in the clear: many batches, fast.
#[test]
fn circuit_matches_clear_with_balances() {
    let mut rng = Rng(0x2026_1028);
    let (mut filled, mut debited, mut refused, mut priced) = (0, 0, 0, 0);
    for round in 0..300 {
        let batch = random_batch(&mut rng, 16);
        let want = expected(&batch);
        assert_eq!(eval(&batch, [MARKET; 3]), want, "round {round}");
        filled += want.fills.iter().filter(|r| r[9] == 1).count();
        debited += (0..batch.accounts.len())
            .filter(|&m| u64::from_le_bytes(want.balances[m]) != batch.accounts[m].balance)
            .count();
        refused += usize::from(unchecked(&batch.orders) != want.fills);
        priced += usize::from(want.price.is_some());
    }
    // The generator must exercise crossing, debits, refusals and both price cases.
    assert!(filled > 300 * 2, "too few fills: {filled}");
    assert!(debited > 300, "too few debits: {debited}");
    assert!(refused > 100, "checks changed too few batches: {refused}");
    assert!(
        (50..250).contains(&priced),
        "price present in {priced} of 300"
    );
}

/// The table size is a parameter: an odd size compiles and still matches.
#[test]
fn other_table_sizes_match() {
    let mut rng = Rng(5);
    for _ in 0..30 {
        let batch = random_batch(&mut rng, 5);
        assert_eq!(eval(&batch, [MARKET; 3]), expected(&batch));
    }
}

/// Parties that disagree on the market get an empty batch: nothing fills or moves.
#[test]
fn market_disagreement_clears_nothing() {
    let batch = random_batch(&mut Rng(3), 16);
    let got = eval(&batch, [MARKET, MARKET, MARKET + 1]);
    assert!(got.fills.iter().all(|r| *r == [0; 10]));
    assert_eq!(got.price, None);
    let before: Vec<_> = batch
        .accounts
        .iter()
        .map(|a| a.balance.to_le_bytes())
        .collect();
    assert_eq!(got.balances, before);
}

/// The full 3-party MPC over localhost TCP: shares combine to the reference, and all
/// three see the same public price.
#[tokio::test(flavor = "multi_thread")]
async fn three_parties_match_clear_with_balances() {
    let mut rng = Rng(7);
    for port in [7100, 7110] {
        let batch = random_batch(&mut rng, 16);
        let shares = run_local(&batch, port).await.unwrap();
        let want = expected(&batch);
        assert_eq!(combine(&shares), want);
        for s in &shares {
            assert_eq!(s.price, want.price);
            assert_ne!(s.fills, want.fills, "no single relayer holds the records");
        }
    }
}
