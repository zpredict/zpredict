//! Escrow viewing key and address from the FROST group key.

use orchard::keys::{FullViewingKey, Scope, SpendingKey};
use rand_core::{OsRng, RngCore};
use zcash_keys::address::UnifiedAddress;
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_protocol::consensus::{BlockHeight, Network, NetworkType, NetworkUpgrade, Parameters};
use zcash_protocol::local_consensus::LocalNetwork;

use crate::error::{Error, Result};

/// The escrow's encoded viewing key and shielded-only receiving address.
pub struct EscrowKeys {
    pub ufvk: String,
    pub address: String,
}

/// An Orchard full viewing key whose spend authority is `ak` (the FROST group key).
///
/// `nk` and `rivk` come from a throwaway random spending key, as in `zcash-sign
/// generate`. Notes sent to this key are not ZIP 2005 quantum-recoverable.
pub fn fvk_from_ak(ak: &[u8; 32]) -> Result<FullViewingKey> {
    let sk = loop {
        let mut b = [0u8; 32];
        OsRng.fill_bytes(&mut b);
        if let Some(sk) = Option::<SpendingKey>::from(SpendingKey::from_bytes(b)) {
            break sk;
        }
    };
    let mut raw = FullViewingKey::from(&sk).to_bytes();
    raw[..32].copy_from_slice(ak);
    FullViewingKey::from_bytes(&raw).ok_or(Error::InvalidAk)
}

/// Escrow keys for `ak`, encoded for `network` (`main`, `test` or `regtest`).
pub fn escrow_keys(ak: &[u8; 32], network: &str) -> Result<EscrowKeys> {
    let fvk = fvk_from_ak(ak)?;
    match network {
        "main" => encode(&Network::MainNetwork, fvk),
        "test" => encode(&Network::TestNetwork, fvk),
        "regtest" => encode(&regtest(), fvk),
        n => Err(Error::UnknownNetwork(n.into())),
    }
}

/// The Orchard full viewing key in an encoded escrow UFVK (any network).
pub fn decode_fvk(ufvk: &str) -> Result<FullViewingKey> {
    UnifiedFullViewingKey::decode(&Network::MainNetwork, ufvk)
        .or_else(|_| UnifiedFullViewingKey::decode(&Network::TestNetwork, ufvk))
        .or_else(|_| UnifiedFullViewingKey::decode(&regtest(), ufvk))
        .map_err(|e| Error::Encoding(format!("{e:?}")))?
        .orchard()
        .cloned()
        .ok_or_else(|| Error::Encoding("UFVK has no Orchard key".into()))
}

/// The escrow's network, chosen at runtime (`main`, `test` or `regtest`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Params {
    Main,
    Test,
    Regtest(LocalNetwork),
}

impl Params {
    pub fn parse(network: &str) -> Result<Self> {
        match network {
            "main" => Ok(Params::Main),
            "test" => Ok(Params::Test),
            "regtest" => Ok(Params::Regtest(regtest())),
            n => Err(Error::UnknownNetwork(n.into())),
        }
    }
}

impl Parameters for Params {
    fn network_type(&self) -> NetworkType {
        match self {
            Params::Main => Network::MainNetwork.network_type(),
            Params::Test => Network::TestNetwork.network_type(),
            Params::Regtest(n) => n.network_type(),
        }
    }

    fn activation_height(&self, nu: NetworkUpgrade) -> Option<BlockHeight> {
        match self {
            Params::Main => Network::MainNetwork.activation_height(nu),
            Params::Test => Network::TestNetwork.activation_height(nu),
            Params::Regtest(n) => n.activation_height(nu),
        }
    }
}

/// Regtest parameters. Encodings depend only on the network type, not the heights.
pub fn regtest() -> LocalNetwork {
    let h = Some(1.into());
    LocalNetwork {
        overwinter: h,
        sapling: h,
        blossom: h,
        heartwood: h,
        canopy: h,
        nu5: h,
        nu6: h,
        nu6_1: h,
        nu6_2: h,
        nu6_3: h,
        nu7: h,
    }
}

fn encode<P: Parameters>(params: &P, fvk: FullViewingKey) -> Result<EscrowKeys> {
    // Ironwood reuses Orchard receivers, so this UA receives Ironwood notes.
    let receiver = fvk.address_at(0u32, Scope::External);
    let ua = UnifiedAddress::from_receivers(Some(receiver), None, None, None, None)
        .ok_or_else(|| Error::Encoding("unified address".into()))?;
    let ufvk = UnifiedFullViewingKey::from_orchard_fvk(fvk)
        .map_err(|e| Error::Encoding(format!("{e:?}")))?
        .encode(params)
        .map_err(|e| Error::Encoding(format!("{e:?}")))?;
    Ok(EscrowKeys {
        ufvk,
        address: ua.encode(params),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use orchard::keys::{SpendAuthorizingKey, SpendValidatingKey};

    #[test]
    fn escrow_ufvk_keeps_the_frost_ak() {
        let sk = SpendingKey::from_bytes([7; 32]).unwrap();
        let ak = SpendValidatingKey::from(&SpendAuthorizingKey::from(&sk)).to_bytes();
        let keys = escrow_keys(&ak, "regtest").unwrap();
        assert!(keys.address.starts_with("uregtest1"));
        let ufvk = UnifiedFullViewingKey::decode(&regtest(), &keys.ufvk).unwrap();
        assert_eq!(ufvk.orchard().unwrap().to_bytes()[..32], ak);
        assert_eq!(decode_fvk(&keys.ufvk).unwrap().to_bytes()[..32], ak);
        assert!(matches!(fvk_from_ak(&[0; 32]), Err(Error::InvalidAk)));
    }
}
