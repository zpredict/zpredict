//! The resolution circuit against `zpredict_core::resolve` on seeded positions.

use zpredict_circuit::harness::{
    Resolution, Rng, expected_resolution, localhost, random_resolution,
};
use zpredict_circuit::net::TcpChannel;
use zpredict_circuit::{Error, resolve_in_clear, run_resolution_on};

fn eval(r: &Resolution, markets: [u32; 3], outcomes: [u8; 3]) -> Result<Vec<[u8; 8]>, Error> {
    let positions = [0, 1, 2].map(|p| r.position_shares[p].as_slice());
    resolve_in_clear(markets, outcomes, positions, [0, 1, 2].map(|p| r.table(p)))
}

fn agreed(r: &Resolution) -> Vec<[u8; 8]> {
    eval(r, [r.market; 3], [r.outcome as u8; 3]).unwrap()
}

/// Many resolutions in the clear: winners, losers, other markets, unfilled orders.
#[test]
fn circuit_matches_resolve() {
    let mut rng = Rng(0x7676);
    let mut paid = 0;
    for round in 0..200 {
        let r = random_resolution(&mut rng, 16, 16);
        let want = expected_resolution(&r);
        assert_eq!(agreed(&r), want, "round {round}");
        let before = r.accounts.iter().map(|a| a.balance.to_le_bytes());
        paid += usize::from(before.ne(want.iter().copied()));
    }
    assert!(paid > 40, "too few resolutions paid anyone: {paid}");
}

/// Parties that disagree on the market or the outcome, or pass an invalid outcome,
/// pay nothing and are told so.
#[test]
fn disagreement_is_an_error() {
    let r = random_resolution(&mut Rng(4), 8, 8);
    let (m, o) = (r.market, r.outcome as u8);
    for (markets, outcomes) in [
        ([m, m, m + 1], [o; 3]),
        ([m; 3], [o, o, 1 - o]),
        ([m; 3], [2; 3]),
    ] {
        let got = eval(&r, markets, outcomes);
        assert!(matches!(got, Err(Error::Disagreement)));
    }
}

/// The real 3-party MPC over localhost TCP: shares combine to the reference.
#[tokio::test(flavor = "multi_thread")]
async fn three_parties_match_resolve() {
    let r = random_resolution(&mut Rng(9), 16, 16);
    let peers = localhost(7130);
    let party = |p: usize| {
        let r = &r;
        async move {
            let channel = TcpChannel::connect(p, &peers).await?;
            let positions = &r.position_shares[p];
            run_resolution_on(&channel, p, r.market, r.outcome, positions, r.table(p)).await
        }
    };
    let (a, b, c) = tokio::join!(party(0), party(1), party(2));
    let shares = [a.unwrap(), b.unwrap(), c.unwrap()];
    let combined: Vec<[u8; 8]> = (0..shares[0].len())
        .map(|i| std::array::from_fn(|k| shares[0][i][k] ^ shares[1][i][k] ^ shares[2][i][k]))
        .collect();
    assert_eq!(combined, expected_resolution(&r));
}
