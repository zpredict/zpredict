//! The circuit against `zpredict_core::clear_with_balances` on seeded random batches.

use zpredict_circuit::{
    Error, Outcome, eval_in_clear,
    harness::{Batch, MARKETS, Rng, combine, expected, random_batch, run_local},
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

fn eval(b: &Batch, markets: [&[u32]; 3], credits: [&[u64]; 3]) -> Result<Outcome, Error> {
    let orders = [0, 1, 2].map(|p| b.order_shares[p].as_slice());
    let accounts = [0, 1, 2].map(|p| b.account_shares[p].as_slice());
    eval_in_clear(markets, credits, orders, accounts)
}

fn agreed(b: &Batch) -> Outcome {
    eval(b, [&MARKETS; 3], [b.credits.as_slice(); 3]).unwrap()
}

/// The circuit's logic, evaluated in the clear: many batches, fast.
#[test]
fn circuit_matches_clear_with_balances() {
    let mut rng = Rng(0x2026_1028);
    let (mut filled, mut debited, mut refused, mut priced, mut credited) = (0, 0, 0, 0, 0);
    for round in 0..300 {
        let mut batch = random_batch(&mut rng, 16, 16);
        let want = expected(&batch);
        assert_eq!(agreed(&batch), want, "round {round}");
        filled += want.fills.iter().filter(|r| r[9] == 1).count();
        debited += (0..batch.accounts.len())
            .filter(|&m| {
                let before = batch.accounts[m].balance + batch.credits[m];
                u64::from_le_bytes(want.balances[m]) != before
            })
            .count();
        refused += usize::from(unchecked(&batch.orders) != want.fills);
        priced += want.prices.iter().flatten().count();
        let credits = std::mem::replace(&mut batch.credits, vec![0; 16]);
        credited += usize::from(expected(&batch).fills != want.fills);
        batch.credits = credits;
    }
    // The generator must exercise crossing, debits, refusals, credits that fund orders,
    // and both price cases.
    assert!(filled > 300 * 2, "too few fills: {filled}");
    assert!(debited > 300, "too few debits: {debited}");
    assert!(refused > 100, "checks changed too few batches: {refused}");
    assert!(credited > 20, "credits changed too few batches: {credited}");
    assert!(
        (100..500).contains(&priced),
        "prices present in {priced} of 600 market slots"
    );
}

/// Slots and table size are parameters: an odd shape compiles and still matches.
#[test]
fn other_shapes_match() {
    let mut rng = Rng(5);
    for _ in 0..30 {
        let batch = random_batch(&mut rng, 7, 5);
        assert_eq!(agreed(&batch), expected(&batch));
    }
}

/// Parties that disagree on the market or the credits clear nothing and are told so.
#[test]
fn disagreement_is_an_error() {
    let batch = random_batch(&mut Rng(3), 16, 16);
    let c = batch.credits.as_slice();
    let other = [7, 9, 0, 0];
    let markets = [&MARKETS[..], &MARKETS, &other];
    assert!(matches!(
        eval(&batch, markets, [c; 3]),
        Err(Error::Disagreement)
    ));
    let more = vec![1; 16];
    let credits = [c, c, more.as_slice()];
    assert!(matches!(
        eval(&batch, [&MARKETS; 3], credits),
        Err(Error::Disagreement)
    ));
}

/// The full 3-party MPC over localhost TCP: shares combine to the reference, and all
/// three see the same public prices.
#[tokio::test(flavor = "multi_thread")]
async fn three_parties_match_clear_with_balances() {
    let mut rng = Rng(7);
    for port in [7100, 7110] {
        let batch = random_batch(&mut rng, 16, 16);
        let shares = run_local(&batch, port).await.unwrap();
        let want = expected(&batch);
        assert_eq!(combine(&shares), want);
        for s in &shares {
            assert_eq!(s.prices, want.prices);
            assert_ne!(s.fills, want.fills, "no single relayer holds the records");
        }
    }
}
