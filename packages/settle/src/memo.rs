//! The deposit memo: an account id and one share of its credential per relayer, each
//! encrypted to that relayer only.
//!
//! The browser holds a 16-byte secret tag `t` (the credential). Its public label is
//! [`account_id`]; relayer `i` gets [`key_shares`]`(t)[i]`, so no relayer ever sees `t`.
//! The shares are deterministic: every deposit to an account carries the same ones, and a
//! relayer seeing a different share for a known id knows someone else chose it.
//!
//! A ZIP 302 arbitrary-data memo (first byte `0xFF`), 512 bytes, zero after byte 154:
//!
//! | bytes | field |
//! |---|---|
//! | `0` | `0xFF` |
//! | `1` | version, `0x02` |
//! | `2..34` | ephemeral X25519 public key `epk` |
//! | `34 + 40i .. 74 + 40i` | relayer `i`'s slot (`i` = 0, 1, 2): ChaCha20-Poly1305 of `id u64 LE ‖ share` (24-byte ciphertext ‖ 16-byte MAC) |
//!
//! Slot key `k_i = BLAKE2b-256(personal "zPredictMemoKey1", X25519(esk, pk_i) ‖ epk ‖ pk_i)`,
//! nonce all zero. `esk` is fresh per memo, so a key never encrypts twice. Relayer `i`
//! opens only slot `i`; nothing else (no order data, no amounts) is in the memo.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use rand_core::OsRng;
use x25519_dalek::{PublicKey, StaticSecret};

use crate::RELAYERS;

/// Length of an account tag (DESIGN.md, Relayer API).
pub const TAG_LEN: usize = 16;
/// Memo format version in byte 1.
const VERSION: u8 = 0x02;
const PLAIN: usize = 8 + TAG_LEN;
const SLOT: usize = PLAIN + 16;
const SLOTS_AT: usize = 2 + 32;

/// An account tag: 16 random bytes chosen by the browser, never sent anywhere whole.
pub type Tag = [u8; TAG_LEN];

/// The account's public label: the first 8 bytes (LE) of
/// `BLAKE2b-64(personal "zPredictAccount1", tag)`.
pub fn account_id(tag: &Tag) -> u64 {
    let h = blake2(b"zPredictAccount1", 8, tag, &[]);
    u64::from_le_bytes(h.as_bytes()[..8].try_into().expect("8 bytes"))
}

/// The three relayers' shares of `tag`: `s_i = BLAKE2b-128(personal "zPredictKeyShare",
/// tag ‖ i)` for `i` = 0, 1 and `s_2 = tag ⊕ s_0 ⊕ s_1`. Any one share is uniform and
/// says nothing about the tag.
pub fn key_shares(tag: &Tag) -> [Tag; RELAYERS] {
    let s = |i: u8| -> Tag {
        let h = blake2(b"zPredictKeyShare", TAG_LEN, tag, &[i]);
        h.as_bytes()[..TAG_LEN].try_into().expect("16 bytes")
    };
    let (s0, s1) = (s(0), s(1));
    [s0, s1, std::array::from_fn(|j| tag[j] ^ s0[j] ^ s1[j])]
}

fn blake2(personal: &[u8; 16], len: usize, a: &[u8], b: &[u8]) -> blake2b_simd::Hash {
    let mut p = blake2b_simd::Params::new();
    p.hash_length(len).personal(personal);
    p.to_state().update(a).update(b).finalize()
}

/// A relayer's static X25519 key for opening its slot. Kept sealed at rest ([`crate::store`]).
pub struct MemoKey(StaticSecret);

impl MemoKey {
    pub fn generate() -> Self {
        MemoKey(StaticSecret::random_from_rng(OsRng))
    }

    pub fn from_bytes(b: [u8; 32]) -> Self {
        MemoKey(StaticSecret::from(b))
    }

    pub fn to_bytes(&self) -> [u8; 32] {
        self.0.to_bytes()
    }

    /// The public key depositors encrypt to.
    pub fn public(&self) -> [u8; 32] {
        PublicKey::from(&self.0).to_bytes()
    }
}

/// The memo for a deposit to the account of `tag`: relayer `i` (public key
/// `relayers[i]`) can read the account id and its own key share only.
pub fn encode(tag: &Tag, relayers: &[[u8; 32]; RELAYERS]) -> [u8; 512] {
    encode_with_esk(
        tag,
        relayers,
        StaticSecret::random_from_rng(OsRng).to_bytes(),
    )
}

/// [`encode`] with a chosen ephemeral key: for the cross-language test vectors only.
/// Reusing `esk` across memos reuses each slot key with the same zero nonce.
pub fn encode_with_esk(tag: &Tag, relayers: &[[u8; 32]; RELAYERS], esk: [u8; 32]) -> [u8; 512] {
    let esk = StaticSecret::from(esk);
    let epk = PublicKey::from(&esk).to_bytes();
    let mut memo = [0u8; 512];
    memo[0] = 0xFF;
    memo[1] = VERSION;
    memo[2..SLOTS_AT].copy_from_slice(&epk);
    let shares = key_shares(tag);
    for (i, pk) in relayers.iter().enumerate() {
        let shared = esk.diffie_hellman(&PublicKey::from(*pk));
        let mut plain = [0u8; PLAIN];
        plain[..8].copy_from_slice(&account_id(tag).to_le_bytes());
        plain[8..].copy_from_slice(&shares[i]);
        let ct = cipher(shared.as_bytes(), &epk, pk)
            .encrypt(&Nonce::default(), Payload::from(&plain[..]))
            .expect("in-memory encryption cannot fail");
        memo[SLOTS_AT + SLOT * i..][..SLOT].copy_from_slice(&ct);
    }
    memo
}

/// The account id and key share in relayer `relayer`'s slot, or `None` if the memo is not
/// a deposit memo or the slot does not open under `key`.
pub fn decode(memo: &[u8; 512], relayer: usize, key: &MemoKey) -> Option<(u64, Tag)> {
    if memo[0] != 0xFF || memo[1] != VERSION || relayer >= RELAYERS {
        return None;
    }
    let epk: [u8; 32] = memo[2..SLOTS_AT].try_into().ok()?;
    let shared = key.0.diffie_hellman(&PublicKey::from(epk));
    if !shared.was_contributory() {
        return None;
    }
    let slot = &memo[SLOTS_AT + SLOT * relayer..][..SLOT];
    let plain = cipher(shared.as_bytes(), &epk, &key.public())
        .decrypt(&Nonce::default(), Payload::from(slot))
        .ok()?;
    let id = u64::from_le_bytes(plain.get(..8)?.try_into().ok()?);
    Some((id, plain.get(8..)?.try_into().ok()?))
}

fn cipher(shared: &[u8; 32], epk: &[u8; 32], pk: &[u8; 32]) -> ChaCha20Poly1305 {
    let k = blake2(
        b"zPredictMemoKey1",
        32,
        shared,
        &[epk.as_slice(), pk].concat(),
    );
    ChaCha20Poly1305::new_from_slice(k.as_bytes()).expect("32-byte key")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_relayer_opens_only_its_own_slot() {
        let keys = [
            MemoKey::generate(),
            MemoKey::generate(),
            MemoKey::generate(),
        ];
        let pks = [keys[0].public(), keys[1].public(), keys[2].public()];
        let tag = [9u8; TAG_LEN];
        let memo = encode(&tag, &pks);
        assert_eq!(memo[0], 0xFF);
        assert!(memo[SLOTS_AT + 3 * SLOT..].iter().all(|b| *b == 0));
        let shares = key_shares(&tag);
        for (i, k) in keys.iter().enumerate() {
            assert_eq!(decode(&memo, i, k), Some((account_id(&tag), shares[i])));
            assert_eq!(decode(&memo, (i + 1) % 3, k), None);
        }
        let other = MemoKey::generate();
        assert_eq!(decode(&memo, 0, &other), None);
    }

    #[test]
    fn rejects_tampered_and_foreign_memos() {
        let k = MemoKey::generate();
        let pks = [k.public(); 3];
        let mut memo = encode(&[1; TAG_LEN], &pks);
        memo[SLOTS_AT] ^= 1;
        assert_eq!(decode(&memo, 0, &k), None);
        let want = (account_id(&[1; TAG_LEN]), key_shares(&[1; TAG_LEN])[1]);
        assert_eq!(decode(&memo, 1, &k), Some(want));
        let mut text = [0u8; 512];
        text[..5].copy_from_slice(b"hello");
        assert_eq!(decode(&text, 0, &k), None);
        let empty = [0xF6; 512];
        assert_eq!(decode(&empty, 0, &k), None);
    }

    #[test]
    fn shares_rebuild_the_tag_and_differ_per_tag() {
        let tag: Tag = std::array::from_fn(|i| i as u8);
        let [a, b, c] = key_shares(&tag);
        assert_eq!(std::array::from_fn(|j| a[j] ^ b[j] ^ c[j]), tag);
        assert_ne!(key_shares(&[1; TAG_LEN])[0], key_shares(&[2; TAG_LEN])[0]);
        assert_ne!(account_id(&[1; TAG_LEN]), account_id(&[2; TAG_LEN]));
    }
}
