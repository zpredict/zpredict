//! A relayer's FROST key share: imported once from the DKG, then only ever sealed.

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

    /// The share in a frost-client config written by `frost-client dkg` (one group).
    /// frost-client keeps it in clear; import it, seal it, delete the config.
    pub fn from_frost_client_config(toml: &str) -> Result<Self> {
        let field = |name: &str| {
            let prefix = format!("{name} = \"");
            toml.lines()
                .find_map(|l| l.strip_prefix(&prefix)?.strip_suffix('"'))
                .and_then(|h| hex::decode(h).ok())
                .ok_or_else(|| Error::Frost(format!("no {name} in frost-client config")))
        };
        Self::from_parts(&field("key_package")?, &field("public_key_package")?)
    }

    fn from_parts(key: &[u8], group: &[u8]) -> Result<Self> {
        Ok(KeyShare {
            key: KeyPackage::deserialize(key).map_err(frost_err)?,
            group: PublicKeyPackage::deserialize(group).map_err(frost_err)?,
        })
    }

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
        Self::from_parts(key, group)
    }

    pub fn id(&self) -> Identifier {
        *self.key.identifier()
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
        let toml = format!(
            "[group.x]\npublic_key_package = \"{}\"\nkey_package = \"{}\"\n",
            hex::encode(s.group.serialize().unwrap()),
            hex::encode(s.key.serialize().unwrap())
        );
        assert_eq!(
            KeyShare::from_frost_client_config(&toml).unwrap().id(),
            s.id()
        );
        assert!(KeyShare::from_frost_client_config("version = 0").is_err());
        assert!(KeyShare::from_bytes(&[9, 0, 0, 0, 1]).is_err());
    }
}
