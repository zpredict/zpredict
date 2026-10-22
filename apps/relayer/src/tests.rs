//! Three relayers in one process, talking over real Noise links on localhost: batch
//! membership, padding, expiry, fills read back through the HTTP API, and restart.

use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use serde_json::{Value, json};
use zpredict_core::{FILL_LEN, ORDER_LEN, Order, Side, clear, fill_records, split};

use crate::api::tests::{app, call};
use crate::batch::Batcher;
use crate::mpc::{InsecureLocalMatcher, Matcher, Polytune};
use crate::peers::Peering;
use crate::state::{Shared, State, Status};

struct Relayer<M> {
    http: Router,
    batcher: Batcher<M>,
}

fn keypair() -> ([u8; 32], [u8; 32]) {
    let kp = snow::Builder::new("Noise_KK_25519_ChaChaPoly_BLAKE2s".parse().unwrap())
        .generate_keypair()
        .unwrap();
    (
        kp.private.try_into().unwrap(),
        kp.public.try_into().unwrap(),
    )
}

fn free_addr() -> std::net::SocketAddr {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
}

/// Three relayers; `wrong_key` gives relayer 2 a key nobody else expects.
fn relayers<M: Matcher>(
    name: &str,
    slots: usize,
    mk: impl Fn() -> M,
    wrong_key: bool,
) -> Vec<Relayer<M>> {
    let addrs = [free_addr(), free_addr(), free_addr()];
    let keys = [keypair(), keypair(), keypair()];
    let public = [keys[0].1, keys[1].1, keys[2].1];
    (0..3)
        .map(|i| {
            let (http, state) = app(i, &format!("{name}-{i}"), i == 0);
            let private = if wrong_key && i == 2 {
                keypair().0
            } else {
                keys[i].0
            };
            let peering = Peering::new(i, addrs, private, public);
            tokio::spawn(peering.clone().listen());
            let window = Duration::from_secs(4);
            let batcher = Batcher {
                state,
                peering,
                matcher: mk(),
                slots,
                window,
                expire: 1,
            };
            Relayer { http, batcher }
        })
        .collect()
}

async fn batch_all<M: Matcher>(r: &[Relayer<M>]) -> Vec<Vec<String>> {
    let (a, b, c) = tokio::join!(
        r[0].batcher.once(),
        r[1].batcher.once(),
        r[2].batcher.once()
    );
    vec![a.unwrap(), b.unwrap(), c.unwrap()]
}

/// Splits `o` and posts share i to relayer i, for the relayers in `to`.
async fn submit<M>(r: &[Relayer<M>], id: &str, o: Order, to: &[usize]) {
    let mut r0 = [0u8; ORDER_LEN];
    let mut r1 = [0u8; ORDER_LEN];
    getrandom::fill(&mut r0).unwrap();
    getrandom::fill(&mut r1).unwrap();
    let shares = split(&o.encode(), r0, r1);
    for &i in to {
        let body = json!({"orderId": id, "share": hex::encode(shares[i])});
        assert_eq!(
            call(&r[i].http, "POST", "/orders", Some(body))
                .await
                .0
                .as_u16(),
            202
        );
    }
}

/// The owner's view: XOR of the three relayers' fill shares.
async fn fill<M>(r: &[Relayer<M>], id: &str) -> Option<[u8; FILL_LEN]> {
    let mut out = [0u8; FILL_LEN];
    for x in r {
        let (_, v) = call(&x.http, "GET", &format!("/orders/{id}"), None).await;
        let share = hex::decode(v["fillShare"].as_str()?).unwrap();
        out.iter_mut().zip(share).for_each(|(a, b)| *a ^= b);
    }
    Some(out)
}

fn order(market: u32, side: Side, price: u8, size: u32) -> Order {
    Order {
        market,
        side,
        price,
        size,
        account: 9,
    }
}

fn id(n: u8) -> String {
    format!("{n:02x}").repeat(16)
}

#[tokio::test(flavor = "multi_thread")]
async fn three_relayers_clear_expire_and_restart() {
    let r = relayers("e2e", 4, || InsecureLocalMatcher, false);
    let (yes, no, other) = (
        order(1, Side::Yes, 60, 3),
        order(1, Side::No, 45, 3),
        order(2, Side::No, 99, 3),
    );
    submit(&r, &id(1), yes, &[0, 1, 2]).await;
    submit(&r, &id(2), no, &[0, 1, 2]).await;
    submit(&r, &id(3), other, &[0, 1, 2]).await; // other market: must not cross
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
    for x in &r {
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
    let (_, s) = call(&r[0].http, "GET", &format!("/orders/{}", id(4)), None).await;
    assert_eq!(s, json!({"status": "pending"}));

    // Next batch: order 4 is a batch old and still missing a share, so it expires.
    batch_all(&r).await;
    for i in [0, 2] {
        let (_, s) = call(&r[i].http, "GET", &format!("/orders/{}", id(4)), None).await;
        assert_eq!(s, json!({"status": "unfilled"}));
    }

    // Restart relayer 0 from its event log: same shares, statuses, balances, view.
    let (_, claim) = call(&r[0].http, "POST", "/judge/claim", None).await;
    let before = snapshot(&r[0].batcher.state, claim["tag"].as_str().unwrap());
    let dir = std::env::temp_dir().join(format!("zpredict-e2e-0-{}", std::process::id()));
    let markets = r[0].batcher.state.lock().unwrap().markets.clone();
    let reopened = State::open(0, markets, &dir).unwrap().shared();
    assert_eq!(snapshot(&reopened, claim["tag"].as_str().unwrap()), before);
}

fn snapshot(s: &Shared, tag: &str) -> Value {
    let s = s.lock().unwrap();
    let status = |n| match s.order(&id(n)).map(|o| o.status) {
        Some(Status::Filled(f)) => hex::encode(f),
        other => format!("{other:?}"),
    };
    let view = serde_json::to_value(s.view_after(0, 1000)).unwrap();
    json!({"batch": s.batch, "orders": [status(1), status(2), status(3), status(4)],
        "balance": s.balance_share(tag), "view": view, "positions": s.positions().len()})
}

#[tokio::test(flavor = "multi_thread")]
async fn batches_cap_at_slots_and_pad() {
    let r = relayers("cap", 2, || InsecureLocalMatcher, false);
    for n in 1..=3 {
        submit(&r, &id(n), order(1, Side::Yes, 50, 1), &[0, 1, 2]).await;
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

/// The real polytune MPC over our Noise channel. ~1 min even with opt-level 3 deps:
/// `cargo test -p zpredict-relayer -- --ignored`.
#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn three_relayers_real_mpc() {
    let _ = zpredict_circuit::program();
    let r = relayers("mpc", zpredict_circuit::N, || Polytune, false);
    let (yes, no) = (order(1, Side::Yes, 60, 3), order(1, Side::No, 45, 2));
    submit(&r, &id(1), yes, &[0, 1, 2]).await;
    submit(&r, &id(2), no, &[0, 1, 2]).await;
    let r = Arc::new(r);
    assert_eq!(batch_all(&r).await[0], [id(1), id(2)]);
    let want = fill_records(&[yes, no], &clear(&[yes, no]));
    assert_eq!(fill(&r, &id(1)).await, Some(want[0]));
    assert_eq!(fill(&r, &id(2)).await, Some(want[1]));
}
