//! The deposit memo: one account tag, encrypted separately to each relayer.
//!
//! A ZIP 302 arbitrary-data memo (first byte `0xFF`), 512 bytes, zero after byte 130:
//!
//! | bytes | field |
//! |---|---|
//! | `0` | `0xFF` |
//! | `1` | version, `0x01` |
//! | `2..34` | ephemeral X25519 public key `epk` |
//! | `34 + 32i .. 66 + 32i` | relayer `i`'s slot (`i` = 0, 1, 2): ChaCha20-Poly1305 of the 16-byte tag (16-byte ciphertext ‖ 16-byte MAC) |
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
const VERSION: u8 = 0x01;
const SLOT: usize = TAG_LEN + 16;
const SLOTS_AT: usize = 2 + 32;

/// An account tag: 16 random bytes chosen by the browser.
pub type Tag = [u8; TAG_LEN];

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

/// The memo for a deposit to account `tag`, readable by each of `relayers` (public keys).
pub fn encode(tag: &Tag, relayers: &[[u8; 32]; RELAYERS]) -> [u8; 512] {
    let esk = StaticSecret::random_from_rng(OsRng);
    let epk = PublicKey::from(&esk).to_bytes();
    let mut memo = [0u8; 512];
    memo[0] = 0xFF;
    memo[1] = VERSION;
    memo[2..SLOTS_AT].copy_from_slice(&epk);
    for (i, pk) in relayers.iter().enumerate() {
        let shared = esk.diffie_hellman(&PublicKey::from(*pk));
        let ct = cipher(shared.as_bytes(), &epk, pk)
            .encrypt(&Nonce::default(), Payload::from(&tag[..]))
            .expect("in-memory encryption cannot fail");
        memo[SLOTS_AT + SLOT * i..][..SLOT].copy_from_slice(&ct);
    }
    memo
}

/// The tag in relayer `relayer`'s slot, or `None` if the memo is not a deposit memo or
/// the slot does not open under `key`.
pub fn decode(memo: &[u8; 512], relayer: usize, key: &MemoKey) -> Option<Tag> {
    if memo[0] != 0xFF || memo[1] != VERSION || relayer >= RELAYERS {
        return None;
    }
    let epk: [u8; 32] = memo[2..SLOTS_AT].try_into().ok()?;
    let shared = key.0.diffie_hellman(&PublicKey::from(epk));
    if !shared.was_contributory() {
        return None;
    }
    let slot = &memo[SLOTS_AT + SLOT * relayer..][..SLOT];
    let tag = cipher(shared.as_bytes(), &epk, &key.public())
        .decrypt(&Nonce::default(), Payload::from(slot))
        .ok()?;
    tag.try_into().ok()
}

fn cipher(shared: &[u8; 32], epk: &[u8; 32], pk: &[u8; 32]) -> ChaCha20Poly1305 {
    let k = blake2b_simd::Params::new()
        .hash_length(32)
        .personal(b"zPredictMemoKey1")
        .to_state()
        .update(shared)
        .update(epk)
        .update(pk)
        .finalize();
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
        for (i, k) in keys.iter().enumerate() {
            assert_eq!(decode(&memo, i, k), Some(tag));
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
        assert_eq!(decode(&memo, 1, &k), Some([1; TAG_LEN]));
        let mut text = [0u8; 512];
        text[..5].copy_from_slice(b"hello");
        assert_eq!(decode(&text, 0, &k), None);
        let empty = [0xF6; 512];
        assert_eq!(decode(&empty, 0, &k), None);
    }
}
