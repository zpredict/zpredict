//! A relayer's FROST key share: made by the DKG ([`crate::dkg`]), then only ever sealed.

use reddsa::frost::redpallas::{
    Error as FrostError, Identifier,
    keys::{KeyPackage, PublicKeyPackage},
};

use crate::error::{Error, Result};

/// One relayer's FROST share of the escrow spend authority.
pub struct KeyShare {
    pub key: KeyPackage,
    pub group: PublicKeyPackage,
}

impl KeyShare {
    /// Store label for a sealed key share ([`crate::store`]).
    pub const LABEL: &'static str = "frost-key-share";

    /// `len(key) u32 LE ‖ key ‖ group`, the plaintext that gets sealed.
    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        let key = self.key.serialize().map_err(frost_err)?;
        let group = self.group.serialize().map_err(frost_err)?;
        Ok([&(key.len() as u32).to_le_bytes()[..], &key, &group].concat())
    }

    pub fn from_bytes(b: &[u8]) -> Result<Self> {
        let bad = || Error::Frost("malformed key share".into());
        let (len, rest) = b.split_first_chunk::<4>().ok_or_else(bad)?;
        let (key, group) = rest
            .split_at_checked(u32::from_le_bytes(*len) as usize)
            .ok_or_else(bad)?;
        Ok(KeyShare {
            key: KeyPackage::deserialize(key).map_err(frost_err)?,
            group: PublicKeyPackage::deserialize(group).map_err(frost_err)?,
        })
    }

    pub fn id(&self) -> Identifier {
        *self.key.identifier()
    }

    /// The escrow spend validating key `ak`: the group's verifying key.
    pub fn ak(&self) -> Result<[u8; 32]> {
        (self.group.verifying_key().serialize().map_err(frost_err)?)
            .try_into()
            .map_err(|_| Error::Frost("group key is not 32 bytes".into()))
    }
}

pub(crate) fn frost_err(e: FrostError) -> Error {
    Error::Frost(e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixture::fixture;

    #[test]
    fn key_shares_round_trip() {
        let f = fixture(None);
        let s = &f.shares[0];
        let back = KeyShare::from_bytes(&s.to_bytes().unwrap()).unwrap();
        assert_eq!((back.key, back.group), (s.key.clone(), s.group.clone()));
        assert!(KeyShare::from_bytes(&[9, 0, 0, 0, 1]).is_err());
    }
}
