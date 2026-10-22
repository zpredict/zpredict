//! FROST 2-of-3 signing of a payout PCZT: one session covers every spend, and every
//! signer verifies before it signs.
//!
//! frost-core 2.2 (RedPallas via `reddsa`, rerandomized) is called as a library; no
//! frost-client CLI, no `y` on stdin. A session is two rounds:
//! 1. each signer [`commit`]s once per spend;
//! 2. the coordinator sends each signer the PCZT, the payout vector and one
//!    [`SignRequest`] per spend; the signer runs [`verify_then_sign`], which recomputes
//!    the sighash and randomizers from the PCZT itself and checks every output against
//!    the payout vector ([`crate::verify`]) before producing any signature share.
//!
//! [`sign_all`] runs both rounds in one process. Across hosts the relayer runs the same
//! steps over its Noise peer links: [`commit`], [`requests`], [`sign_packages`] on each
//! signer against its own copy of the PCZT and payout vector, then [`aggregate`].

use std::collections::BTreeMap;

use orchard::keys::FullViewingKey;
use pczt::Pczt;
use rand_core::OsRng;
use reddsa::frost::redpallas::{
    self as frost, Identifier, RandomizedParams, Randomizer as FrostRandomizer, SigningPackage,
    keys::PublicKeyPackage,
    round1::{SigningCommitments, SigningNonces},
    round2::SignatureShare,
};

use crate::error::{Error, Result};
use crate::payout::Payout;
use crate::share::{KeyShare, frost_err};
use crate::sign::{Randomizer, SpendSig, randomizers, sighash};
use crate::verify::verify;

/// What the coordinator asks a signer to sign for one spend.
pub struct SignRequest {
    pub spend: Randomizer,
    pub package: SigningPackage,
}

/// Round 1: fresh nonces and commitments, one per spend. Nonces never leave the signer.
pub fn commit(share: &KeyShare, spends: usize) -> (Vec<SigningNonces>, Vec<SigningCommitments>) {
    (0..spends)
        .map(|_| frost::round1::commit(share.key.signing_share(), &mut OsRng))
        .unzip()
}

/// Round 2: verify the PCZT against the payout vector, then sign every requested spend.
/// Refuses unless each request carries this signer's own sighash and the randomizer of
/// the matching spend in the PCZT.
pub fn verify_then_sign(
    share: &KeyShare,
    nonces: &[SigningNonces],
    pczt: &Pczt,
    payouts: &[Payout],
    fvk: &FullViewingKey,
    requests: &[SignRequest],
) -> Result<Vec<SignatureShare>> {
    let hash = verify(pczt, payouts, fvk)?;
    let spends = randomizers(pczt)?;
    if spends.len() != requests.len() || nonces.len() != requests.len() {
        return Err(Error::Refused(format!(
            "{} spend(s) in the PCZT, {} request(s), {} nonce(s)",
            spends.len(),
            requests.len(),
            nonces.len()
        )));
    }
    spends
        .iter()
        .zip(requests)
        .zip(nonces)
        .map(|((own, req), nonce)| {
            if req.spend != *own {
                return Err(Error::Refused(format!(
                    "randomizer for spend {}",
                    own.index
                )));
            }
            if req.package.message().as_slice() != hash {
                return Err(Error::Refused("message is not this PCZT's sighash".into()));
            }
            frost::round2::sign(&req.package, nonce, &share.key, randomizer(&own.alpha)?)
                .map_err(frost_err)
        })
        .collect()
}

/// Coordinator, after round 1: one request per spend, each a signing package over this
/// PCZT's sighash with every signer's commitment for that spend (`commitments[id][j]`).
pub fn requests(
    pczt: &Pczt,
    commitments: &BTreeMap<Identifier, Vec<SigningCommitments>>,
) -> Result<Vec<SignRequest>> {
    let hash = sighash(pczt)?;
    let spends = randomizers(pczt)?;
    if commitments.values().any(|c| c.len() != spends.len()) {
        return Err(Error::Frost(
            "a signer committed to the wrong number of spends".into(),
        ));
    }
    Ok(spends
        .iter()
        .enumerate()
        .map(|(j, spend)| SignRequest {
            spend: *spend,
            package: SigningPackage::new(
                commitments.iter().map(|(id, c)| (*id, c[j])).collect(),
                &hash,
            ),
        })
        .collect())
}

/// Signer, round 2 from a remote coordinator: rebuilds each request from the spends of
/// its own copy of the PCZT and the coordinator's signing packages, then
/// [`verify_then_sign`]s. Nothing the coordinator says about spends is taken on trust.
pub fn sign_packages(
    share: &KeyShare,
    nonces: &[SigningNonces],
    pczt: &Pczt,
    payouts: &[Payout],
    fvk: &FullViewingKey,
    packages: Vec<SigningPackage>,
) -> Result<Vec<SignatureShare>> {
    let spends = randomizers(pczt)?;
    if spends.len() != packages.len() {
        return Err(Error::Refused(format!(
            "{} spend(s) in the PCZT, {} package(s)",
            spends.len(),
            packages.len()
        )));
    }
    let requests: Vec<SignRequest> = (spends.into_iter().zip(packages))
        .map(|(spend, package)| SignRequest { spend, package })
        .collect();
    verify_then_sign(share, nonces, pczt, payouts, fvk, &requests)
}

/// Coordinator: one aggregated signature per spend from every signer's shares
/// (`shares[id][j]` for request `j`).
pub fn aggregate(
    group: &PublicKeyPackage,
    requests: &[SignRequest],
    shares: &BTreeMap<Identifier, Vec<SignatureShare>>,
) -> Result<Vec<SpendSig>> {
    requests
        .iter()
        .enumerate()
        .map(|(j, req)| {
            let mine: BTreeMap<_, _> = (shares.iter())
                .map(|(id, sh)| sh.get(j).map(|s| (*id, *s)))
                .collect::<Option<_>>()
                .ok_or_else(|| Error::Frost("a signer returned too few shares".into()))?;
            let alpha = randomizer(&req.spend.alpha)?;
            let params = RandomizedParams::from_randomizer(group.verifying_key(), alpha);
            let sig = frost::aggregate(&req.package, &mine, group, &params).map_err(frost_err)?;
            let sig = sig.serialize().map_err(frost_err)?;
            Ok(SpendSig {
                pool: req.spend.pool,
                index: req.spend.index,
                sig: sig
                    .try_into()
                    .map_err(|_| Error::Frost("signature is not 64 bytes".into()))?,
            })
        })
        .collect()
}

/// Coordinator: one session over every spend with `signers` (any 2 of 3), each of
/// which verifies independently, all in this process. Returns one aggregated signature
/// per spend. Across hosts the relayer runs the same steps over its peer links.
pub fn sign_all(
    pczt: &Pczt,
    payouts: &[Payout],
    fvk: &FullViewingKey,
    signers: &[&KeyShare],
) -> Result<Vec<SpendSig>> {
    let group = &signers
        .first()
        .ok_or(Error::Frost("no signers".into()))?
        .group;
    let spends = randomizers(pczt)?.len();
    let round1: Vec<_> = signers.iter().map(|s| commit(s, spends)).collect();
    let commitments = (signers.iter().zip(&round1))
        .map(|(s, (_, c))| (s.id(), c.clone()))
        .collect();
    let requests = requests(pczt, &commitments)?;
    let shares = (signers.iter().zip(&round1))
        .map(|(s, (nonces, _))| {
            Ok((
                s.id(),
                verify_then_sign(s, nonces, pczt, payouts, fvk, &requests)?,
            ))
        })
        .collect::<Result<_>>()?;
    aggregate(group, &requests, &shares)
}

fn randomizer(alpha: &[u8; 32]) -> Result<FrostRandomizer> {
    FrostRandomizer::deserialize(alpha).map_err(frost_err)
}

#[cfg(test)]
mod tests;
