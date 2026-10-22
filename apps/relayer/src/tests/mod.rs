//! Three relayers in one process, talking over real Noise links on localhost: batch
//! membership, padding, expiry, balances, fills read back through the HTTP API, restart.

mod batching;
mod funds;
mod outcomes;
mod settlement;

use std::time::Duration;

use axum::Router;
use serde_json::json;
use zpredict_core::{FILL_LEN, ORDER_LEN, Order, Side, split};

use crate::api::tests::{app, call};
use crate::batch::Batcher;
use crate::mpc::Matcher;
use crate::peers::Peering;
use crate::state::tag_account;

pub(super) struct Relayer<M> {
    pub http: Router,
    pub batcher: Batcher<M>,
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
pub(super) fn relayers<M: Matcher>(
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
                rows: 16,
                window,
                expire: 1,
                frost: None,
                judge: true,
                escrow: None,
            };
            Relayer { http, batcher }
        })
        .collect()
}

pub(super) async fn batch_all<M: Matcher>(r: &[Relayer<M>]) -> Vec<Vec<String>> {
    let (a, b, c) = tokio::join!(
        r[0].batcher.once(),
        r[1].batcher.once(),
        r[2].batcher.once()
    );
    vec![a.unwrap(), b.unwrap(), c.unwrap()]
}

/// Splits `o` and posts share i to relayer i, for the relayers in `to`.
pub(super) async fn submit<M>(r: &[Relayer<M>], id: &str, o: Order, to: &[usize]) {
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
pub(super) async fn fill<M>(r: &[Relayer<M>], id: &str) -> Option<[u8; FILL_LEN]> {
    let mut out = [0u8; FILL_LEN];
    for x in r {
        let (_, v) = call(&x.http, "GET", &format!("/orders/{id}"), None).await;
        let share = hex::decode(v["fillShare"].as_str()?).unwrap();
        out.iter_mut().zip(share).for_each(|(a, b)| *a ^= b);
    }
    Some(out)
}

pub(super) fn order(market: u32, side: Side, price: u8, size: u32, account: u64) -> Order {
    Order {
        market,
        side,
        price,
        size,
        account,
    }
}

pub(super) fn id(n: u8) -> String {
    format!("{n:02x}").repeat(16)
}

/// A judge-mode account on relayer 0 (5000 half-ticks): its tag and order `account`.
pub(super) async fn funded<M>(r: &[Relayer<M>]) -> (String, u64) {
    let (_, claim) = call(&r[0].http, "POST", "/judge/claim", None).await;
    let tag = claim["tag"].as_str().unwrap().to_owned();
    let account = tag_account(&tag);
    (tag, account)
}

/// The owner's view of a balance: XOR of the three relayers' shares.
pub(super) async fn balance<M>(r: &[Relayer<M>], tag: &str) -> u64 {
    let mut b = [0u8; 8];
    for x in r {
        let (_, v) = call(&x.http, "GET", &format!("/accounts/{tag}"), None).await;
        let share = hex::decode(v["balanceShare"].as_str().unwrap()).unwrap();
        b.iter_mut().zip(share).for_each(|(a, s)| *a ^= s);
    }
    u64::from_le_bytes(b)
}
