//! FROST 2-of-3 signatures on market outcomes (`zpredict_oracle::Resolution::message`)
//! with the escrow's key shares, so a published outcome is checkable against the same
//! group key that controls the funds.
//!
//! Plain (not rerandomized) FROST: the result is an ordinary RedPallas `SpendAuth`
//! signature under the group key `ak`, which [`verify`] and `@zpredict/sdk`'s
//! `verifyOutcome` check. Outcome messages start with a domain prefix and are never 32
//! bytes, so they cannot pass for a transaction sighash, and spends are signed under a
//! rerandomized key anyway.
//!
//! Signers are named by relayer index `i`; their FROST identifier is `i + 1`, as in
//! [`crate::dkg_local`]. Byte-level API so the relayer carries the rounds over its Noise
//! links without depending on `reddsa` itself.

use std::collections::BTreeMap;

use rand_core::OsRng;
use reddsa::frost::redpallas::{
    Identifier, Signature, SigningPackage, VerifyingKey, frost, round1::SigningCommitments,
    round2::SignatureShare,
};

use crate::error::{Error, Result};
use crate::share::{KeyShare, frost_err};

pub use reddsa::frost::redpallas::round1::SigningNonces as Nonces;

/// The FROST identifier of relayer `index`.
pub fn identifier(index: usize) -> Result<Identifier> {
    let id = u16::try_from(index + 1).map_err(|_| Error::Frost("relayer index".into()))?;
    Identifier::try_from(id).map_err(frost_err)
}

/// Round 1: fresh nonces (never leave this signer, use once) and the commitment to send.
pub fn commit(share: &KeyShare) -> Result<(Nonces, Vec<u8>)> {
    let (nonces, c) = frost::round1::commit(share.key.signing_share(), &mut OsRng);
    Ok((nonces, c.serialize().map_err(frost_err)?))
}

fn package(commitments: &BTreeMap<usize, Vec<u8>>, msg: &[u8]) -> Result<SigningPackage> {
    let c = commitments
        .iter()
        .map(|(i, c)| {
            let c = SigningCommitments::deserialize(c).map_err(frost_err)?;
            Ok((identifier(*i)?, c))
        })
        .collect::<Result<BTreeMap<_, _>>>()?;
    Ok(SigningPackage::new(c, msg))
}

/// Round 2: this signer's share of the signature on `msg`, given every signer's
/// commitment (relayer index → bytes).
pub fn sign(
    share: &KeyShare,
    nonces: &Nonces,
    commitments: &BTreeMap<usize, Vec<u8>>,
    msg: &[u8],
) -> Result<Vec<u8>> {
    let pkg = package(commitments, msg)?;
    let s = frost::round2::sign(&pkg, nonces, &share.key).map_err(frost_err)?;
    Ok(s.serialize())
}

/// Combines the signers' shares into a 64-byte signature and checks it against the
/// group key before returning it.
pub fn aggregate(
    share: &KeyShare,
    commitments: &BTreeMap<usize, Vec<u8>>,
    shares: &BTreeMap<usize, Vec<u8>>,
    msg: &[u8],
) -> Result<[u8; 64]> {
    let pkg = package(commitments, msg)?;
    let shares = shares
        .iter()
        .map(|(i, s)| {
            Ok((
                identifier(*i)?,
                SignatureShare::deserialize(s).map_err(frost_err)?,
            ))
        })
        .collect::<Result<BTreeMap<_, _>>>()?;
    let sig = frost::aggregate(&pkg, &shares, &share.group).map_err(frost_err)?;
    let sig: [u8; 64] = (sig.serialize().map_err(frost_err)?)
        .try_into()
        .map_err(|_| Error::Frost("signature is not 64 bytes".into()))?;
    if !verify(&share.ak()?, msg, &sig) {
        return Err(Error::Frost("aggregate signature does not verify".into()));
    }
    Ok(sig)
}

/// RedPallas `SpendAuth` verification of `sig` on `msg` under the group key `ak`.
pub fn verify(ak: &[u8; 32], msg: &[u8], sig: &[u8; 64]) -> bool {
    let (Ok(vk), Ok(sig)) = (VerifyingKey::deserialize(ak), Signature::deserialize(sig)) else {
        return false;
    };
    vk.verify(msg, &sig).is_ok()
}

/// Both rounds in one process, for tests and vectors. `signers` are `(index, share)`.
pub fn sign_local(signers: &[(usize, &KeyShare)], msg: &[u8]) -> Result<[u8; 64]> {
    let first = signers.first().ok_or(Error::Frost("no signers".into()))?.1;
    let round1 = signers
        .iter()
        .map(|(i, s)| Ok((*i, commit(s)?)))
        .collect::<Result<Vec<_>>>()?;
    let commitments: BTreeMap<usize, Vec<u8>> =
        round1.iter().map(|(i, (_, c))| (*i, c.clone())).collect();
    let shares = signers
        .iter()
        .zip(&round1)
        .map(|((i, s), (_, (nonces, _)))| Ok((*i, sign(s, nonces, &commitments, msg)?)))
        .collect::<Result<BTreeMap<_, _>>>()?;
    aggregate(first, &commitments, &shares, msg)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dkg_local;

    #[test]
    fn any_two_of_three_sign_and_tampering_fails() {
        let s = dkg_local().unwrap();
        let ak = s[0].ak().unwrap();
        for pair in [[0, 1], [0, 2], [1, 2]] {
            let signers = pair.map(|i| (i, &s[i]));
            let sig = sign_local(&signers, b"zpredict outcome").unwrap();
            assert!(verify(&ak, b"zpredict outcome", &sig));
            assert!(!verify(&ak, b"zpredict outcomf", &sig));
            let mut bad = sig;
            bad[40] ^= 1;
            assert!(!verify(&ak, b"zpredict outcome", &bad));
        }
        // One share alone is below the threshold.
        assert!(sign_local(&[(0, &s[0])], b"m").is_err());
        assert_eq!(s[1].id(), identifier(1).unwrap());
    }
}
