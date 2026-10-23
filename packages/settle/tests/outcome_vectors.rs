//! Cross-language outcome-signature vectors: `testdata/outcome-vectors.json` is read by
//! the TS sdk tests (`verifyOutcome`). FROST signatures are randomized, so the file is
//! generated once (`UPDATE_VECTORS=1 cargo test -p zpredict-settle --test outcome_vectors`)
//! with a throwaway DKG and then only checked. No secret is written.

use serde_json::{Value, json};
use zpredict_oracle::{Evidence, Outcome, Resolution};
use zpredict_settle::{dkg_local, outcome};

const PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/testdata/outcome-vectors.json");

/// The resolution's own fields (block or source form) plus message, signature, validity.
fn case(r: &Resolution, sig: &[u8; 64], valid: bool) -> Value {
    let mut c = serde_json::to_value(r).unwrap();
    let extra = json!({
        "message": hex::encode(r.message()), "sig": hex::encode(sig), "valid": valid,
    });
    (c.as_object_mut().unwrap()).extend(extra.as_object().unwrap().clone());
    c
}

fn block(height: u32, hash: &str) -> Evidence {
    Evidence::Block {
        height,
        block_hash: hash.into(),
    }
}

fn polymarket(condition_id: &str) -> Evidence {
    Evidence::Source {
        source: "polymarket".into(),
        condition_id: condition_id.into(),
    }
}

fn generate() -> Value {
    let s = dkg_local().unwrap();
    let hash_a = "0000000000a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b";
    let hash_b = "00000000017d6f9e5c4b3a29180716f5e4d3c2b1a09f8e7d6c5b4a3928170605";
    let yes = Resolution {
        market: 1_073_460,
        outcome: Outcome::Yes,
        evidence: block(3_526_128, hash_a),
    };
    let no = Resolution {
        market: 1_073_461,
        outcome: Outcome::No,
        evidence: block(3_526_176, hash_b),
    };
    // A mirrored market (packages/plugins/polymarket): source and conditionId, no block.
    // The conditionId is a real market that resolved Yes (packages/plugins/polymarket/testdata/resolved-yes.json).
    let mirrored = Resolution {
        market: 99,
        outcome: Outcome::Yes,
        evidence: polymarket("0x96df10bb5b67b16adf969226919cf818f8b3935c6ef9c79507d6169994b2c4e6"),
    };
    let sig_yes = outcome::sign_local(&[(0, &s[0]), (1, &s[1])], &yes.message()).unwrap();
    let sig_no = outcome::sign_local(&[(1, &s[1]), (2, &s[2])], &no.message()).unwrap();
    let sig_mirrored = outcome::sign_local(&[(0, &s[0]), (2, &s[2])], &mirrored.message()).unwrap();
    let mut flipped = sig_yes;
    flipped[63] ^= 0x01;
    let flipped_outcome = Resolution {
        outcome: Outcome::No,
        ..yes.clone()
    };
    let other_block = Resolution {
        evidence: block(3_526_128, hash_b),
        ..yes.clone()
    };
    let other_condition = Resolution {
        evidence: polymarket("0xab5dadf5febcd92d545509dc527473462b2a7e8eaad1ce1b6b1594dc84d020bc"),
        ..mirrored.clone()
    };
    let mirrored_no = Resolution {
        outcome: Outcome::No,
        ..mirrored.clone()
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
            case(&mirrored, &sig_mirrored, true),
            case(&other_condition, &sig_mirrored, false),
            case(&mirrored_no, &sig_mirrored, false),
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
