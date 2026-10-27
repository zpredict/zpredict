//! Rolling markets and FROST-signed outcomes end to end: three relayers each generate and
//! resolve markets from their own (fixture) chain, then sign over the batch's Noise links.

use std::collections::BTreeMap;
use std::sync::Arc;

use zpredict_oracle::{Block, FixtureChain, Market, Resolution, Status};
use zpredict_plugin_polymarket::Point;
use zpredict_settle::{dkg_local, outcome};

use super::*;
use crate::chain::{registry, tick};
use crate::markets::Rolling;
use crate::mpc::InsecureLocalMatcher;
use crate::reference::Reference;

fn rolling() -> Rolling {
    Rolling {
        plugin: "shielded-actions".into(),
        interval_secs: 3600,
        horizon_secs: 3600,
        close_secs: 300,
        sample_blocks: 24,
        keep_resolved: 24,
        fast_from: 3_543_405,
    }
}

/// Mainnet-like blocks up to `tip`; `fork` changes the hash of block 3,527,060.
fn chain(tip: u32, fork: bool) -> FixtureChain {
    let blocks = (3_526_900..=3_527_200)
        .map(|h| Block {
            height: h,
            hash: format!("{:064x}", u64::from(h) + u64::from(fork && h == 3_527_060)),
            shielded_actions: h % 7,
            ..Block::default()
        })
        .collect();
    FixtureChain { tip, blocks }
}

/// A headline market resolving at 3,527,060, where relayer 2's node will disagree.
fn headline() -> Market {
    serde_json::from_value(json!({
        "id": 3, "question": "Will block 3,527,060 contain at least 1 shielded action?",
        "plugin": "shielded-actions", "params": {"minActions": 1},
        "closeHeight": 3_527_050, "resolveHeight": 3_527_060, "status": "open"
    }))
    .unwrap()
}

#[tokio::test(flavor = "multi_thread")]
async fn three_relayers_generate_resolve_and_sign_only_what_they_agree_on() {
    let mut r = relayers("outcomes", 2, || InsecureLocalMatcher, false);
    let shares = dkg_local().unwrap();
    let ak = shares[0].ak().unwrap();
    for (x, s) in r.iter_mut().zip(shares) {
        x.batcher.frost = Some(Arc::new(s));
        x.batcher.state.lock().unwrap().markets = vec![headline()];
    }
    let (reg, roll) = (registry(Default::default()), rolling());

    // Window start 3,527,040: every relayer makes the same rolling market.
    for (i, x) in r.iter().enumerate() {
        tick(
            &chain(3_527_041, i == 2),
            &reg,
            &x.batcher.state,
            Some(&roll),
        )
        .unwrap();
    }
    let made: Vec<Market> = (r.iter())
        .map(|x| x.batcher.state.lock().unwrap().markets[1].clone())
        .collect();
    assert!(made.iter().all(|m| *m == made[0] && m.rolling));
    assert_eq!((made[0].id, made[0].resolve_height), (1_073_480, 3_527_088));

    // Ten blocks past H: both markets resolve; relayer 2's node has another block 3,527,060.
    for (i, x) in r.iter().enumerate() {
        tick(
            &chain(3_527_098, i == 2),
            &reg,
            &x.batcher.state,
            Some(&roll),
        )
        .unwrap();
    }
    batch_all(&r).await;

    let mut sigs = Vec::new();
    for x in &r {
        let (_, list) = call(&x.http, "GET", "/markets", None).await;
        let (head, roll) = (&list[0], &list[1]);
        assert_eq!(head["status"], "resolved");
        assert_eq!(
            head.get("outcomeSig"),
            None,
            "relayers disagree: never signed"
        );
        assert_eq!(roll["status"], "resolved");
        assert_eq!(roll["blockHeight"], 3_527_088);
        assert_eq!(roll["blockHash"], format!("{:064x}", 3_527_088));
        let m: Market = serde_json::from_value(roll.clone()).unwrap();
        let sig: [u8; 64] = hex::decode(m.outcome_sig.as_ref().unwrap())
            .unwrap()
            .try_into()
            .unwrap();
        assert!(outcome::verify(
            &ak,
            &m.resolution().unwrap().message(),
            &sig
        ));
        sigs.push(sig);
    }
    assert!(
        sigs.iter().all(|s| *s == sigs[0]),
        "one aggregate signature"
    );

    // Nothing left to sign: the next batch keeps the signature and the batch still runs.
    batch_all(&r).await;
    let st = r[0].batcher.state.lock().unwrap();
    assert_eq!(st.markets[1].outcome_sig, Some(hex::encode(sigs[0])));
    assert_eq!(st.markets[1].status, Status::Resolved);
}

#[tokio::test]
async fn group_key_is_served_only_with_a_share() {
    let (unsigned, state) = crate::api::tests::app(1, "group-key", false);
    let (code, body) = call(&unsigned, "GET", "/group-key", None).await;
    assert_eq!(code.as_u16(), 404, "{body}");
    let signed = crate::api::router(crate::api::Api {
        state,
        origin: "http://localhost:3000".into(),
        table_rows: 16,
        judge_credit: None,
        memo_key: None,
        group_key: Some([7; 32]),
        escrow: None,
        references: Default::default(),
        price: Default::default(),
    });
    let (_, body) = call(&signed, "GET", "/group-key", None).await;
    assert_eq!(
        body,
        json!({"relayer": 1, "groupKey": "07".repeat(32), "threshold": 2})
    );
}

/// A mirrored market: each relayer reads Polymarket itself; what all three read the same is
/// signed over `source` and `conditionId`, with no block. `/markets` also serves the
/// reference price the relayer fetched.
#[tokio::test(flavor = "multi_thread")]
async fn a_polymarket_resolution_is_signed_over_its_source() {
    let mut r = relayers("outcomes-polymarket", 2, || InsecureLocalMatcher, false);
    let shares = dkg_local().unwrap();
    let ak = shares[0].ak().unwrap();
    let cid = "0xd5d9fc47718bd553592d126b1fa5e87183d27f3936975b0c04cc0f2dec1f1bb4";
    let mirrored: Market = serde_json::from_value(json!({
        "id": 11, "question": "Will the Democratic Party control the House?",
        "plugin": "polymarket", "params": {"conditionId": cid, "slug": "house"},
        "closeHeight": 90, "resolveHeight": 90, "status": "closed", "category": "Politics"
    }))
    .unwrap();
    let resolution = Resolution::from_source(&mirrored, "polymarket", cid, true);
    for (x, s) in r.iter_mut().zip(shares) {
        x.batcher.frost = Some(Arc::new(s));
        let mut m = mirrored.clone();
        m.set_resolution(&resolution);
        x.batcher.state.lock().unwrap().markets = vec![m];
    }
    batch_all(&r).await;

    let reference = Reference {
        source: "polymarket",
        price: 92.5,
        url: "https://polymarket.com/market/house".into(),
        updated_at: None,
        volume: Some(1234.5),
        history: vec![Point { t: 1, price: 90.0 }],
    };
    let http = crate::api::router(crate::api::Api {
        state: r[2].batcher.state.clone(),
        origin: "http://localhost:3000".into(),
        table_rows: 16,
        judge_credit: None,
        memo_key: None,
        group_key: None,
        escrow: None,
        references: Arc::new(
            [(11, reference)]
                .into_iter()
                .collect::<BTreeMap<_, _>>()
                .into(),
        ),
        price: Arc::new(
            Some(crate::price::Spot {
                zec_usd: 1237.34,
                source: "coinbase",
                at: 1,
            })
            .into(),
        ),
    });
    let (_, price) = call(&http, "GET", "/price", None).await;
    assert_eq!(price["zecUsd"], 1237.34);
    assert_eq!(price["source"], "coinbase");
    let (_, list) = call(&http, "GET", "/markets", None).await;
    let m = &list[0];
    assert_eq!(m["source"], "polymarket");
    assert_eq!(
        (m["conditionId"].as_str(), m.get("blockHash")),
        (Some(cid), None)
    );
    assert_eq!(m["category"], "Politics");
    assert_eq!(
        m["reference"],
        json!({"source": "polymarket", "price": 92.5, "url": "https://polymarket.com/market/house",
               "volume": 1234.5, "history": [{"t": 1, "price": 90.0}]})
    );
    let m: Market = serde_json::from_value(m.clone()).unwrap();
    assert_eq!(m.resolution(), Some(resolution.clone()));
    let sig = hex::decode(m.outcome_sig.expect("signed")).unwrap();
    assert!(outcome::verify(
        &ak,
        &resolution.message(),
        &sig.try_into().unwrap()
    ));
}
