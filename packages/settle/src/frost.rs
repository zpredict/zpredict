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
//! [`sign_all`] runs both rounds in one process. Across hosts the relayer carries the
//! same messages over its TLS channel.

use std::collections::BTreeMap;

use orchard::keys::FullViewingKey;
use pczt::Pczt;
use rand_core::OsRng;
use reddsa::frost::redpallas::{
    self as frost, RandomizedParams, Randomizer as FrostRandomizer, SigningPackage,
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

/// Coordinator: one session over every spend with `signers` (any 2 of 3), each of
/// which verifies independently. Returns one aggregated signature per spend.
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
    let hash = sighash(pczt)?;
    let spends = randomizers(pczt)?;
    let round1: Vec<_> = signers.iter().map(|s| commit(s, spends.len())).collect();
    let requests: Vec<SignRequest> = spends
        .iter()
        .enumerate()
        .map(|(j, spend)| SignRequest {
            spend: *spend,
            package: SigningPackage::new(
                signers
                    .iter()
                    .zip(&round1)
                    .map(|(s, (_, c))| (s.id(), c[j]))
                    .collect(),
                &hash,
            ),
        })
        .collect();
    let round2 = signers
        .iter()
        .zip(&round1)
        .map(|(s, (nonces, _))| verify_then_sign(s, nonces, pczt, payouts, fvk, &requests))
        .collect::<Result<Vec<_>>>()?;

    requests
        .iter()
        .enumerate()
        .map(|(j, req)| {
            let shares: BTreeMap<_, _> = signers
                .iter()
                .zip(&round2)
                .map(|(s, sh)| (s.id(), sh[j]))
                .collect();
            let alpha = randomizer(&req.spend.alpha)?;
            let params = RandomizedParams::from_randomizer(group.verifying_key(), alpha);
            let sig = frost::aggregate(&req.package, &shares, group, &params).map_err(frost_err)?;
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

fn randomizer(alpha: &[u8; 32]) -> Result<FrostRandomizer> {
    FrostRandomizer::deserialize(alpha).map_err(frost_err)
}

#[cfg(test)]
mod tests {
    use orchard::keys::{Scope, SpendingKey};

    use super::*;
    use crate::fixture::fixture;
    use crate::sign::apply;

    #[test]
    fn two_of_three_sign_every_spend_in_one_session() {
        let f = fixture(None);
        assert_eq!(randomizers(&f.pczt).unwrap().len(), 2);
        let signers = [&f.shares[0], &f.shares[2]];
        let sigs = sign_all(&f.pczt, &f.payouts, &f.fvk, &signers).unwrap();
        assert_eq!(sigs.len(), 2);
        // `apply` checks each signature against its spend's rk.
        apply(f.pczt, &sigs).unwrap();
    }

    #[test]
    fn a_tampered_output_is_refused() {
        let thief = FullViewingKey::from(&SpendingKey::from_bytes([66; 32]).unwrap())
            .address_at(0u32, Scope::External);
        let f = fixture(Some(thief));
        let err = sign_all(&f.pczt, &f.payouts, &f.fvk, &[&f.shares[0], &f.shares[1]]);
        assert!(matches!(err, Err(Error::Refused(m)) if m.contains("not in the payout vector")));
    }

    #[test]
    fn a_request_for_another_message_is_refused() {
        let f = fixture(None);
        let s = &f.shares[1];
        let spends = randomizers(&f.pczt).unwrap();
        let (nonces, commitments) = commit(s, spends.len());
        let requests: Vec<_> = spends
            .iter()
            .zip(&commitments)
            .map(|(spend, c)| SignRequest {
                spend: *spend,
                package: SigningPackage::new([(s.id(), *c)].into(), &[0u8; 32]),
            })
            .collect();
        let err = verify_then_sign(s, &nonces, &f.pczt, &f.payouts, &f.fvk, &requests);
        assert!(matches!(err, Err(Error::Refused(m)) if m.contains("sighash")));
    }
}
