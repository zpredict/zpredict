//! Rolling markets and FROST-signed outcomes end to end: three relayers each generate and
//! resolve markets from their own (fixture) chain, then sign over the batch's Noise links.

use std::sync::Arc;

use zpredict_oracle::{Block, FixtureChain, Market, Status};
use zpredict_settle::{dkg_local, outcome};

use super::*;
use crate::chain::{registry, tick};
use crate::markets::Rolling;
use crate::mpc::InsecureLocalMatcher;

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
    let (reg, roll) = (registry(), rolling());

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
        judge_credit: None,
        memo_key: None,
        group_key: Some([7; 32]),
        escrow: None,
    });
    let (_, body) = call(&signed, "GET", "/group-key", None).await;
    assert_eq!(
        body,
        json!({"relayer": 1, "groupKey": "07".repeat(32), "threshold": 2})
    );
}
