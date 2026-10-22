//! The FROST 2-of-3 key ceremony with frost-core as a library: the output goes straight to
//! the caller as [`KeyShare`]s to seal, so no config file ever holds a share in clear (the
//! frost-client CLI writes it into its TOML; this replaces it).
//!
//! [`dkg_local`] runs the three parties in one process, the same-host demo shape that
//! [`crate::frost::sign_all`] uses. Across hosts, each relayer runs `part1`/`part2`/`part3`
//! itself and the relayer carries round-1 packages (broadcast) and round-2 packages
//! (one per recipient, secret) over its authenticated Noise channel.

use std::collections::BTreeMap;

use rand_core::OsRng;
use reddsa::frost::redpallas::Identifier;
use reddsa::frost::redpallas::keys::dkg::{part1, part2, part3};

use crate::error::{Error, Result};
use crate::share::{KeyShare, frost_err};
use crate::{RELAYERS, THRESHOLD};

/// Runs the DKG for all three relayers here; party `i` gets identifier `i + 1`.
pub fn dkg_local() -> Result<Vec<KeyShare>> {
    let n = RELAYERS as u16;
    let ids = (1..=n)
        .map(|i| Identifier::try_from(i).map_err(frost_err))
        .collect::<Result<Vec<_>>>()?;
    let others = |me: Identifier| ids.iter().copied().filter(move |id| *id != me);

    let round1 = ids
        .iter()
        .map(|id| part1(*id, n, THRESHOLD, OsRng).map_err(frost_err))
        .collect::<Result<Vec<_>>>()?;
    let broadcast: BTreeMap<_, _> = ids
        .iter()
        .zip(&round1)
        .map(|(id, (_, p))| (*id, p.clone()))
        .collect();
    let seen = |me: Identifier| -> BTreeMap<_, _> {
        others(me).map(|o| (o, broadcast[&o].clone())).collect()
    };

    let round2 = ids
        .iter()
        .zip(round1)
        .map(|(id, (secret, _))| part2(secret, &seen(*id)).map_err(frost_err))
        .collect::<Result<Vec<_>>>()?;
    let shares = ids
        .iter()
        .zip(&round2)
        .map(|(id, (secret, _))| {
            // Each party's round-2 inbox: the package every other party made for it.
            let inbox: BTreeMap<_, _> = ids
                .iter()
                .zip(&round2)
                .filter(|(from, _)| *from != id)
                .map(|(from, (_, out))| (*from, out[id].clone()))
                .collect();
            let (key, group) = part3(secret, &seen(*id), &inbox).map_err(frost_err)?;
            Ok(KeyShare { key, group })
        })
        .collect::<Result<Vec<_>>>()?;

    if shares.iter().any(|s| s.group != shares[0].group) {
        return Err(Error::Frost("parties disagree on the group key".into()));
    }
    Ok(shares)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::fvk_from_ak;

    #[test]
    fn three_parties_agree_on_one_escrow_key() {
        let shares = dkg_local().unwrap();
        assert_eq!(shares.len(), 3);
        let ak: [u8; 32] = (shares[0].group.verifying_key().serialize().unwrap())
            .try_into()
            .unwrap();
        // The group key is a valid Orchard spend validating key (even y, from part3).
        fvk_from_ak(&ak).unwrap();
        let ids: std::collections::BTreeSet<_> = shares.iter().map(KeyShare::id).collect();
        assert_eq!(ids.len(), 3);
    }
}
