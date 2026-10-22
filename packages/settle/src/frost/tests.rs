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
fn a_remote_signer_signs_from_wire_packages_alone() {
    let f = fixture(None);
    let (local, remote) = (&f.shares[0], &f.shares[2]);
    let n = randomizers(&f.pczt).unwrap().len();
    let ((nl, cl), (nr, cr)) = (commit(local, n), commit(remote, n));
    let cr = cr
        .iter()
        .map(|c| SigningCommitments::deserialize(&c.serialize().unwrap()).unwrap());
    let commitments = [(local.id(), cl), (remote.id(), cr.collect())].into();
    let reqs = requests(&f.pczt, &commitments).unwrap();
    let wire = reqs
        .iter()
        .map(|r| SigningPackage::deserialize(&r.package.serialize().unwrap()));
    let packages = wire.collect::<std::result::Result<_, _>>().unwrap();
    let theirs = sign_packages(remote, &nr, &f.pczt, &f.payouts, &f.fvk, packages).unwrap();
    let theirs = theirs
        .iter()
        .map(|s| SignatureShare::deserialize(&s.serialize()).unwrap());
    let ours = verify_then_sign(local, &nl, &f.pczt, &f.payouts, &f.fvk, &reqs).unwrap();
    let shares = [(local.id(), ours), (remote.id(), theirs.collect())].into();
    apply(f.pczt, &aggregate(&local.group, &reqs, &shares).unwrap()).unwrap();
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
