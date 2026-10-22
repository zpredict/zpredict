//! Cross-language outcome-signature vectors: `testdata/outcome-vectors.json` is read by
//! the TS sdk tests (`verifyOutcome`). FROST signatures are randomized, so the file is
//! generated once (`UPDATE_VECTORS=1 cargo test -p zpredict-settle --test outcome_vectors`)
//! with a throwaway DKG and then only checked. No secret is written.

use serde_json::{Value, json};
use zpredict_oracle::{Outcome, Resolution};
use zpredict_settle::{dkg_local, outcome};

const PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/testdata/outcome-vectors.json");

fn case(r: &Resolution, sig: &[u8; 64], valid: bool) -> Value {
    json!({
        "market": r.market, "outcome": r.outcome, "height": r.height, "blockHash": r.block_hash,
        "message": hex::encode(r.message()), "sig": hex::encode(sig), "valid": valid,
    })
}

fn generate() -> Value {
    let s = dkg_local().unwrap();
    let yes = Resolution {
        market: 1_073_460,
        outcome: Outcome::Yes,
        height: 3_526_128,
        block_hash: "0000000000a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b".into(),
    };
    let no = Resolution {
        market: 1_073_461,
        outcome: Outcome::No,
        height: 3_526_176,
        block_hash: "00000000017d6f9e5c4b3a29180716f5e4d3c2b1a09f8e7d6c5b4a3928170605".into(),
    };
    let sig_yes = outcome::sign_local(&[(0, &s[0]), (1, &s[1])], &yes.message()).unwrap();
    let sig_no = outcome::sign_local(&[(1, &s[1]), (2, &s[2])], &no.message()).unwrap();
    let mut flipped = sig_yes;
    flipped[63] ^= 0x01;
    let flipped_outcome = Resolution {
        outcome: Outcome::No,
        ..yes.clone()
    };
    let other_block = Resolution {
        block_hash: no.block_hash.clone(),
        ..yes.clone()
    };
    json!({
        "groupKey": hex::encode(s[0].ak().unwrap()),
        "cases": [
            case(&yes, &sig_yes, true),
            case(&no, &sig_no, true),
            case(&flipped_outcome, &sig_yes, false),
            case(&other_block, &sig_yes, false),
            case(&yes, &flipped, false),
            case(&yes, &sig_no, false),
        ],
    })
}

#[test]
fn vectors_verify_in_rust() {
    if std::env::var_os("UPDATE_VECTORS").is_some() {
        let text = serde_json::to_string_pretty(&generate()).unwrap();
        std::fs::write(PATH, text + "\n").unwrap();
    }
    let v: Value = serde_json::from_str(&std::fs::read_to_string(PATH).unwrap()).unwrap();
    let ak: [u8; 32] = hex::decode(v["groupKey"].as_str().unwrap())
        .unwrap()
        .try_into()
        .unwrap();
    for c in v["cases"].as_array().unwrap() {
        let r: Resolution = serde_json::from_value(c.clone()).unwrap();
        let msg = r.message();
        assert_eq!(hex::encode(&msg), c["message"].as_str().unwrap());
        let sig: [u8; 64] = hex::decode(c["sig"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap();
        assert_eq!(outcome::verify(&ak, &msg, &sig), c["valid"] == true, "{c}");
    }
}
