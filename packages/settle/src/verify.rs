//! What every signer checks, on its own copy of the PCZT, before it signs anything.
//!
//! The coordinator is not trusted: a signer recomputes the sighash from the PCZT (so a
//! signature can only ever authorize this transaction) and checks that the transaction
//! - has nothing transparent, Sapling or Orchard: only an Ironwood bundle;
//! - commits every output to the recipient and value the PCZT claims (`cmx` check),
//!   including the zero-valued padding outputs;
//! - pays every entry of the agreed payout vector exactly once, with a ciphertext that
//!   decrypts to that note (recovered with the escrow's OVK);
//! - sends every other non-zero output to the escrow's own internal (change) scope,
//!   decryptable by the escrow;
//! - pays exactly the ZIP 317 fee for its action count, so no value leaks to miners.

use orchard::keys::{FullViewingKey, PreparedIncomingViewingKey, Scope};
use pczt::Pczt;
use pczt::roles::low_level_signer::Signer;
use zcash_primitives::transaction::fees::zip317::{GRACE_ACTIONS, MARGINAL_FEE};
use zcash_protocol::PoolType;

use crate::error::{Error, Result};
use crate::payout::Payout;
use crate::sign::{Pool, sighash, with_bundle};

/// Checks `pczt` against `payouts` and the escrow `fvk`; returns the sighash to sign.
pub fn verify(pczt: &Pczt, payouts: &[Payout], fvk: &FullViewingKey) -> Result<[u8; 32]> {
    for (pool, name) in [
        (PoolType::TRANSPARENT, "transparent"),
        (PoolType::SAPLING, "Sapling"),
        (PoolType::ORCHARD, "Orchard"),
    ] {
        if pczt.has_data_in_pool(pool) {
            return Err(refuse(format!("has {name} inputs or outputs")));
        }
    }

    let ovks = [fvk.to_ovk(Scope::External), fvk.to_ovk(Scope::Internal)];
    let change_ivk = PreparedIncomingViewingKey::new(&fvk.to_ivk(Scope::Internal));
    let mut unpaid = payouts.to_vec();
    let mut actions = 0;
    with_bundle(Signer::new(pczt.clone()), Pool::Ironwood, |bundle| {
        let version = *bundle.bundle_version();
        actions = bundle.actions().len();
        for (i, a) in bundle.actions().iter().enumerate() {
            let out = a.output();
            out.verify_note_commitment(a.spend())
                .map_err(|e| refuse(format!("action {i}: output does not match its cmx: {e:?}")))?;
            let (Some(to), Some(value)) = (*out.recipient(), *out.value()) else {
                return Err(refuse(format!("action {i}: output fields redacted")));
            };
            let zats = value.inner();
            if zats == 0 {
                continue;
            }
            if let Some(k) = unpaid.iter().position(|p| p.to == to && p.zats == zats) {
                let recovered = ovks.iter().any(|ovk| {
                    matches!(a.recover_output_with_ovk(ovk, version),
                        Ok(Some((note, addr, _))) if addr == to && note.value() == value)
                });
                if !recovered {
                    return Err(refuse(format!(
                        "action {i}: payout ciphertext does not decrypt"
                    )));
                }
                unpaid.swap_remove(k);
            } else if fvk.scope_for_address(&to) == Some(Scope::Internal) {
                if !matches!(a.decrypt_output_with_ivk(&change_ivk, version), Ok(Some(_))) {
                    return Err(refuse(format!(
                        "action {i}: change ciphertext does not decrypt"
                    )));
                }
            } else {
                return Err(refuse(format!(
                    "action {i}: {zats} zats to an address not in the payout vector"
                )));
            }
        }
        Ok(())
    })?;
    if !unpaid.is_empty() {
        return Err(refuse(format!("{} payout(s) missing", unpaid.len())));
    }

    let tx = pczt
        .clone()
        .into_effects()
        .map_err(|e| Error::Sighash(format!("{e:?}")))?;
    let balance = tx
        .ironwood_bundle()
        .map_or(0, |b| i64::from(*b.value_balance()));
    let fee = MARGINAL_FEE.into_u64() * actions.max(GRACE_ACTIONS) as u64;
    if u64::try_from(balance) != Ok(fee) {
        return Err(refuse(format!(
            "fee {balance} is not the ZIP 317 fee {fee}"
        )));
    }
    sighash(pczt)
}

fn refuse(why: String) -> Error {
    Error::Refused(why)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixture::fixture;

    #[test]
    fn accepts_exactly_the_agreed_payouts() {
        let f = fixture(None);
        let hash = verify(&f.pczt, &f.payouts, &f.fvk).unwrap();
        assert_eq!(hash, sighash(&f.pczt).unwrap());

        let mut more = f.payouts.clone();
        more.push(more[0]);
        assert!(matches!(
            verify(&f.pczt, &more, &f.fvk),
            Err(Error::Refused(_))
        ));

        let mut less = f.payouts.clone();
        less[1].zats -= 1;
        assert!(matches!(
            verify(&f.pczt, &less, &f.fvk),
            Err(Error::Refused(_))
        ));

        // Under another escrow key the payouts are not recoverable with its OVKs and the
        // change is an unknown recipient (actions are shuffled, so either comes first).
        let other = fixture(None);
        assert!(matches!(
            verify(&f.pczt, &f.payouts, &other.fvk),
            Err(Error::Refused(_))
        ));
    }
}
