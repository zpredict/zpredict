//! Hashcash over a server-issued challenge, bound to the memo it pays for.
//!
//! challenge = `expiry u64 LE ‖ random 16 ‖ MAC 16`, MAC = keyed BLAKE2b-128 under a key
//! made at startup, so issuing keeps no state. A solution is a `nonce` with
//! `BLAKE2b-256(personal "zPredictFaucetPw", challenge ‖ BLAKE2b-256(memo) ‖ nonce u64 LE)`
//! starting with `bits` zero bits. Each challenge is accepted once (kept until it expires).
//! The browser solves it in components/faucet/pow.ts.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::memo;

pub const CHALLENGE_LEN: usize = 8 + 16 + 16;
/// Seconds a challenge stays valid.
pub const TTL: u64 = 300;

pub struct Pow {
    key: [u8; 32],
    pub bits: u32,
    /// Spent challenges (their random part) and when they expire.
    spent: Mutex<HashMap<[u8; 16], u64>>,
}

#[derive(Debug, PartialEq)]
pub enum Reject {
    Malformed,
    Expired,
    Spent,
    TooWeak,
}

impl Pow {
    pub fn new(bits: u32) -> Self {
        let mut key = [0u8; 32];
        getrandom::fill(&mut key).expect("OS randomness");
        Pow {
            key,
            bits,
            spent: Mutex::default(),
        }
    }

    pub fn issue(&self, now: u64) -> String {
        let mut c = [0u8; CHALLENGE_LEN];
        c[..8].copy_from_slice(&(now + TTL).to_le_bytes());
        getrandom::fill(&mut c[8..24]).expect("OS randomness");
        let mac = self.mac(&c[..24]);
        c[24..].copy_from_slice(mac.as_bytes());
        hex::encode(c)
    }

    fn mac(&self, b: &[u8]) -> blake2b_simd::Hash {
        blake2b_simd::Params::new()
            .hash_length(16)
            .key(&self.key)
            .hash(b)
    }

    /// Checks and spends a solution.
    pub fn verify(
        &self,
        challenge: &str,
        m: &[u8; memo::LEN],
        nonce: u64,
        now: u64,
    ) -> Result<(), Reject> {
        let c: [u8; CHALLENGE_LEN] = hex::decode(challenge)
            .ok()
            .and_then(|b| b.try_into().ok())
            .ok_or(Reject::Malformed)?;
        // Constant-time: the MAC bytes are compared without an early exit.
        let mac = self.mac(&c[..24]);
        let diff = (mac.as_bytes().iter().zip(&c[24..])).fold(0, |d, (a, b)| d | (a ^ b));
        if diff != 0 {
            return Err(Reject::Malformed);
        }
        let expiry = u64::from_le_bytes(c[..8].try_into().expect("8 bytes"));
        if expiry < now {
            return Err(Reject::Expired);
        }
        if zero_bits(&digest(&c, m, nonce)) < self.bits {
            return Err(Reject::TooWeak);
        }
        let mut spent = self.spent.lock().expect("pow lock");
        spent.retain(|_, &mut e| e >= now);
        let id: [u8; 16] = c[8..24].try_into().expect("16 bytes");
        if spent.insert(id, expiry).is_some() {
            return Err(Reject::Spent);
        }
        Ok(())
    }
}

pub fn digest(challenge: &[u8], m: &[u8; memo::LEN], nonce: u64) -> [u8; 32] {
    let memo_hash = blake2b_simd::Params::new().hash_length(32).hash(m);
    let h = blake2b_simd::Params::new()
        .hash_length(32)
        .personal(b"zPredictFaucetPw")
        .to_state()
        .update(challenge)
        .update(memo_hash.as_bytes())
        .update(&nonce.to_le_bytes())
        .finalize();
    h.as_bytes().try_into().expect("32 bytes")
}

fn zero_bits(h: &[u8]) -> u32 {
    let mut n = 0;
    for &b in h {
        n += b.leading_zeros();
        if b != 0 {
            break;
        }
    }
    n
}

/// The first nonce that meets `bits` (tests and the regtest script; browsers do the same).
pub fn solve(challenge: &str, m: &[u8; memo::LEN], bits: u32) -> u64 {
    let c = hex::decode(challenge).unwrap_or_default();
    (0..)
        .find(|&n| zero_bits(&digest(&c, m, n)) >= bits)
        .expect("a nonce exists")
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u64 = 1_800_000_000;

    #[test]
    fn verify_once_and_bound_to_memo() {
        // 16 bits: a solution for `a` also passing for `b` is a 2^-16 chance.
        let pow = Pow::new(16);
        let (a, b) = ([1u8; memo::LEN], [2u8; memo::LEN]);
        let c = pow.issue(NOW);
        let n = solve(&c, &a, 16);
        assert_eq!(pow.verify(&c, &b, n, NOW), Err(Reject::TooWeak));
        assert_eq!(pow.verify(&c, &a, n, NOW), Ok(()));
        assert_eq!(pow.verify(&c, &a, n, NOW), Err(Reject::Spent));
    }

    #[test]
    fn rejects_forged_expired_and_weak() {
        let pow = Pow::new(8);
        let m = [7u8; memo::LEN];
        let c = pow.issue(NOW);
        let n = solve(&c, &m, 8);
        assert_eq!(pow.verify(&c, &m, n, NOW + TTL + 1), Err(Reject::Expired));
        let other = Pow::new(8).issue(NOW);
        let n2 = solve(&other, &m, 8);
        assert_eq!(pow.verify(&other, &m, n2, NOW), Err(Reject::Malformed));
        assert_eq!(pow.verify("00", &m, 0, NOW), Err(Reject::Malformed));
        let strict = Pow {
            bits: 64,
            ..Pow::new(0)
        };
        let c3 = strict.issue(NOW);
        assert_eq!(strict.verify(&c3, &m, 0, NOW), Err(Reject::TooWeak));
    }

    #[test]
    fn zero_bits_counts_across_bytes() {
        assert_eq!(zero_bits(&[0, 0x10, 0xFF]), 11);
        assert_eq!(zero_bits(&[0x80]), 0);
        assert_eq!(zero_bits(&[0, 0]), 16);
    }
}
