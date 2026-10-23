//! The deposit-memo checks a faucet can make without any relayer secret.
//!
//! Layout (`zpredict_settle::memo`): `0xFF | 0x02 | epk (32) | 3 x 40-byte slots`, zero
//! after byte 154. The slots are AEAD ciphertexts only the relayers can open, so the faucet
//! checks the shape (marker, version, a contributory X25519 `epk`, zero padding) and passes
//! the memo through unchanged. It cannot tell which keys the slots were encrypted to: a
//! memo for stale keys sends a drop nobody is credited for, and the rate limit bounds that.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use x25519_dalek::{PublicKey, StaticSecret};

pub const LEN: usize = 512;
/// Bytes in use: marker, version, epk and the three slots.
pub const USED: usize = 2 + 32 + 3 * 40;

/// A ZIP 321 `memo=` value (base64url, no padding, trailing zeros optional, as
/// `memoParam` in @zpredict/sdk builds it) decoded to a well-formed v2 deposit memo.
pub fn parse(param: &str) -> Option<[u8; LEN]> {
    let b = URL_SAFE_NO_PAD.decode(param).ok()?;
    if !(USED..=LEN).contains(&b.len()) {
        return None;
    }
    let mut m = [0u8; LEN];
    m[..b.len()].copy_from_slice(&b);
    let epk: [u8; 32] = m[2..34].try_into().ok()?;
    // A clamped scalar is a multiple of 8, so a low-order epk gives the all-zero secret.
    let contributory = StaticSecret::from([1; 32])
        .diffie_hellman(&PublicKey::from(epk))
        .was_contributory();
    let ok = m[0] == 0xFF && m[1] == 0x02 && contributory && m[USED..].iter().all(|&x| x == 0);
    ok.then_some(m)
}

/// The memo back as the canonical `memo=` value for the payment request.
pub fn param(m: &[u8; LEN]) -> String {
    URL_SAFE_NO_PAD.encode(&m[..USED])
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The cross-language vectors settle and the sdk are pinned to.
    fn vectors() -> Vec<([u8; LEN], String)> {
        let raw = include_str!("../../../packages/settle/testdata/memo-vectors.json");
        let v: serde_json::Value = serde_json::from_str(raw).unwrap();
        let cases = v["memos"].as_array().unwrap();
        cases
            .iter()
            .map(|c| {
                let mut m = [0u8; LEN];
                let used = hex::decode(c["memo"].as_str().unwrap()).unwrap();
                m[..used.len()].copy_from_slice(&used);
                (m, c["uriMemo"].as_str().unwrap().to_owned())
            })
            .collect()
    }

    #[test]
    fn accepts_real_memos_in_either_length() {
        for (m, uri) in vectors() {
            assert_eq!(parse(&uri), Some(m));
            assert_eq!(param(&m), uri);
            assert_eq!(parse(&URL_SAFE_NO_PAD.encode(m)), Some(m));
        }
    }

    #[test]
    fn rejects_malformed() {
        let m = vectors()[0].0;
        let with = |f: &dyn Fn(&mut [u8; LEN])| {
            let mut x = m;
            f(&mut x);
            URL_SAFE_NO_PAD.encode(x)
        };
        assert_eq!(parse(&with(&|x| x[0] = 0xF6)), None, "not arbitrary data");
        assert_eq!(parse(&with(&|x| x[1] = 0x01)), None, "old version");
        assert_eq!(parse(&with(&|x| x[200] = 1)), None, "data past the slots");
        assert_eq!(parse(&with(&|x| x[2..34].fill(0))), None, "low-order epk");
        assert_eq!(
            parse(&URL_SAFE_NO_PAD.encode(&m[..USED - 1])),
            None,
            "short"
        );
        assert_eq!(parse("not base64!"), None);
        assert_eq!(parse(&format!("{}=", param(&m))), None, "padding");
    }
}
