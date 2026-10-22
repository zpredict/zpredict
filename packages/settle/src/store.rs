//! Relayer secrets at rest: FROST key shares, the escrow viewing key, the memo key.
//!
//! Each is sealed with ChaCha20-Poly1305 under a 32-byte store key that the relayer
//! process gets from the environment ([`KEY_ENV`], 64 hex characters) and never writes
//! to disk. A sealed file is `nonce (12 bytes) ‖ ciphertext ‖ MAC`. The AAD is the
//! secret's label (`ufvk`, `memo-key`, `frost-key-package`, …), so one sealed secret
//! cannot be passed off as another. Plaintext secrets are never written to files.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use rand_core::{OsRng, RngCore};

use crate::error::{Error, Result};

/// Environment variable holding the hex-encoded 32-byte store key.
pub const KEY_ENV: &str = "ZPREDICT_STORE_KEY";

/// The store key from [`KEY_ENV`].
pub fn key_from_env() -> Result<[u8; 32]> {
    let hex = std::env::var(KEY_ENV).map_err(|_| Error::Store(format!("{KEY_ENV} not set")))?;
    hex::decode(hex.trim())
        .ok()
        .and_then(|v| v.try_into().ok())
        .ok_or_else(|| Error::Store(format!("{KEY_ENV} must be 64 hex characters")))
}

/// Encrypts `plain` under `key`, bound to `label`.
pub fn seal(key: &[u8; 32], label: &str, plain: &[u8]) -> Vec<u8> {
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let ct = cipher(key)
        .encrypt(&Nonce::from(nonce), payload(plain, label))
        .expect("in-memory encryption cannot fail");
    [&nonce[..], &ct].concat()
}

/// Decrypts what [`seal`] produced for the same `key` and `label`.
pub fn open(key: &[u8; 32], label: &str, sealed: &[u8]) -> Result<Vec<u8>> {
    let (nonce, ct) = sealed
        .split_at_checked(12)
        .ok_or_else(|| Error::Store("sealed data too short".into()))?;
    let nonce: [u8; 12] = nonce.try_into().expect("split at 12");
    cipher(key)
        .decrypt(&Nonce::from(nonce), payload(ct, label))
        .map_err(|_| Error::Store(format!("cannot open {label:?}: wrong key or label")))
}

/// Reads and opens a sealed file with the store key from the environment.
pub fn open_file(path: &std::path::Path, label: &str) -> Result<Vec<u8>> {
    open(&key_from_env()?, label, &std::fs::read(path)?)
}

fn cipher(key: &[u8; 32]) -> ChaCha20Poly1305 {
    ChaCha20Poly1305::new_from_slice(key).expect("32-byte key")
}

fn payload<'a>(msg: &'a [u8], label: &'a str) -> Payload<'a, 'a> {
    Payload {
        msg,
        aad: label.as_bytes(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_only_with_the_same_key_and_label() {
        let key = [3u8; 32];
        let sealed = seal(&key, "ufvk", b"secret");
        assert!(!sealed.windows(6).any(|w| w == b"secret"));
        assert_eq!(open(&key, "ufvk", &sealed).unwrap(), b"secret");
        assert!(open(&key, "memo-key", &sealed).is_err());
        assert!(open(&[4u8; 32], "ufvk", &sealed).is_err());
        assert!(open(&key, "ufvk", &sealed[..8]).is_err());
        assert_ne!(seal(&key, "ufvk", b"secret"), sealed);
    }
}
