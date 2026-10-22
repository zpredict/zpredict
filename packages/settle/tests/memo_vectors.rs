//! Cross-language deposit-memo vectors: `testdata/memo-vectors.json` is read by the TS sdk
//! tests. Regenerate with `UPDATE_VECTORS=1 cargo test -p zpredict-settle --test memo_vectors`.
//! All keys here are fixed test values, never used for anything real.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use zpredict_settle::memo::{self, MemoKey};
use zpredict_settle::{DENOMINATIONS, UNIT_ZATS};

/// The memo's non-zero prefix: `0xFF | 0x01 | epk | 3 slots`; bytes 130..512 are zero.
const PREFIX: usize = 2 + 32 + 3 * 32;

fn vectors() -> String {
    let keys: Vec<MemoKey> = (0..3u8)
        .map(|i| {
            MemoKey::from_bytes(std::array::from_fn(|j| {
                (j as u8).wrapping_mul(7) ^ (0x10 * (i + 1))
            }))
        })
        .collect();
    let pks = [keys[0].public(), keys[1].public(), keys[2].public()];
    let cases = [
        ([0x42u8; 16], [0x01u8; 32]),
        (std::array::from_fn(|i| i as u8), [0xa5u8; 32]),
    ];

    let relayers: Vec<String> = keys
        .iter()
        .map(|k| {
            format!(
                r#"{{"secret": "{}", "public": "{}"}}"#,
                hex::encode(k.to_bytes()),
                hex::encode(k.public())
            )
        })
        .collect();
    let memos: Vec<String> = cases
        .iter()
        .map(|(tag, esk)| {
            let m = memo::encode_with_esk(tag, &pks, *esk);
            assert!(m[PREFIX..].iter().all(|b| *b == 0));
            for (i, k) in keys.iter().enumerate() {
                assert_eq!(memo::decode(&m, i, k), Some(*tag));
            }
            format!(
                r#"{{"tag": "{}", "esk": "{}", "memo": "{}", "uriMemo": "{}"}}"#,
                hex::encode(tag),
                hex::encode(esk),
                hex::encode(&m[..PREFIX]),
                URL_SAFE_NO_PAD.encode(&m[..PREFIX])
            )
        })
        .collect();
    let list = |v: Vec<String>| format!("[\n    {}\n  ]", v.join(",\n    "));
    format!(
        "{{\n  \"unitZats\": {UNIT_ZATS},\n  \"denominations\": {DENOMINATIONS:?},\n  \"relayers\": {},\n  \"memos\": {}\n}}\n",
        list(relayers),
        list(memos)
    )
}

#[test]
fn vectors_match_file() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/testdata/memo-vectors.json");
    let want = vectors();
    if std::env::var_os("UPDATE_VECTORS").is_some() {
        std::fs::create_dir_all(concat!(env!("CARGO_MANIFEST_DIR"), "/testdata")).unwrap();
        std::fs::write(path, &want).unwrap();
    }
    let have = std::fs::read_to_string(path).expect("run with UPDATE_VECTORS=1 to create");
    assert_eq!(
        have, want,
        "memo vectors changed; regenerate and update the sdk"
    );
}
