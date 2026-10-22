//! The clearing circuit against `zpredict_core::{apply_flows, clear_with_balances}` on
//! seeded random batches.

use zpredict_circuit::{
    Error, Outcome, Public, eval_in_clear,
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

fn eval(b: &Batch, public: [&Public; 3]) -> Result<Outcome, Error> {
    let orders = [0, 1, 2].map(|p| b.order_shares[p].as_slice());
    let accounts = [0, 1, 2].map(|p| b.account_shares[p].as_slice());
    eval_in_clear(public, orders, accounts)
}

fn agreed(b: &Batch) -> Outcome {
    eval(b, [&b.public; 3]).unwrap()
}

/// The circuit's logic, evaluated in the clear: many batches, fast.
#[test]
fn circuit_matches_clear_with_balances() {
    let mut rng = Rng(0x2026_1028);
    let (mut filled, mut refused, mut priced, mut credited) = (0, 0, 0, 0);
    let (mut withdrawn, mut overdrawn) = (0, 0);
    for round in 0..300 {
        let mut batch = random_batch(&mut rng, 16, 16);
        let want = expected(&batch);
        assert_eq!(agreed(&batch), want, "round {round}");
        filled += want.fills.iter().filter(|r| r[9] == 1).count();
        refused += usize::from(unchecked(&batch.orders) != want.fills);
        priced += want.prices.iter().flatten().count();
        withdrawn += want.withdrawn.iter().filter(|w| **w).count();
        overdrawn += (want.withdrawn.iter().zip(&batch.public.debits))
            .filter(|(w, d)| !**w && **d > 0)
            .count();
        let credits = std::mem::replace(&mut batch.public.credits, vec![0; 16]);
        credited += usize::from(expected(&batch).fills != want.fills);
        batch.public.credits = credits;
    }
    // The generator must exercise crossing, refusals, credits that fund orders,
    // withdrawals that fit and ones that don't, and both price cases.
    assert!(filled > 300 * 2, "too few fills: {filled}");
    assert!(refused > 100, "checks changed too few batches: {refused}");
    assert!(credited > 20, "credits changed too few batches: {credited}");
    assert!(withdrawn > 100, "too few withdrawals: {withdrawn}");
    assert!(overdrawn > 100, "too few refused withdrawals: {overdrawn}");
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

/// Parties that disagree on any public input clear nothing and are told so.
#[test]
fn disagreement_is_an_error() {
    let batch = random_batch(&mut Rng(3), 16, 16);
    let ours = &batch.public;
    let other_markets = Public {
        markets: vec![7, 9, 0, 0],
        ..ours.clone()
    };
    let more_credits = Public {
        credits: vec![1; 16],
        ..ours.clone()
    };
    let more_debits = Public {
        debits: vec![1; 16],
        ..ours.clone()
    };
    for theirs in [&other_markets, &more_credits, &more_debits] {
        let got = eval(&batch, [ours, ours, theirs]);
        assert!(matches!(got, Err(Error::Disagreement)));
    }
    assert_eq!(ours.markets, MARKETS);
}

/// The full 3-party MPC over localhost TCP: shares combine to the reference, and all
/// three see the same public outputs.
#[tokio::test(flavor = "multi_thread")]
async fn three_parties_match_clear_with_balances() {
    let mut rng = Rng(7);
    for port in [7100, 7110] {
        let batch = random_batch(&mut rng, 8, 16);
        let shares = run_local(&batch, port).await.unwrap();
        let want = expected(&batch);
        assert_eq!(combine(&shares), want);
        for s in &shares {
            assert_eq!((&s.prices, &s.withdrawn), (&want.prices, &want.withdrawn));
            assert_ne!(s.fills, want.fills, "no single relayer holds the records");
        }
    }
}
