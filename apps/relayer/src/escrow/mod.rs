//! The relayer's escrow side (`[settlement]` in the config): its sealed secrets, the
//! deposit scanner ([`scan`]) and the withdrawal payout ([`payout`]).
//!
//! What each relayer holds, all unsealed only in memory: the escrow UFVK (shared), its
//! own memo key and its own FROST key share. Relayer 0 also drives zcash-devtool over the
//! escrow wallet to build, prove and broadcast payouts ([`devtool`]).

pub mod devtool;
pub mod payout;
pub mod scan;

use zpredict_settle::{FullViewingKey, KeyShare, MemoKey, Params, store};

use crate::config::Settlement;
use crate::error::{Error, Result};
use devtool::Devtool;

pub struct Escrow {
    pub index: usize,
    pub params: Params,
    pub fvk: FullViewingKey,
    memo: [u8; 32],
    pub share: KeyShare,
    pub start_height: u32,
    pub confirmations: u32,
    /// Relayer 0 only.
    pub devtool: Option<Devtool>,
}

impl Escrow {
    /// Opens the sealed secrets with `ZPREDICT_STORE_KEY`.
    pub fn load(c: &Settlement, index: usize) -> Result<Self> {
        let key = store::key_from_env()?;
        let open = |path: &std::path::Path, label| store::open(&key, label, &std::fs::read(path)?);
        let ufvk = String::from_utf8(open(&c.ufvk, "ufvk")?)
            .map_err(|_| Error::Config("sealed UFVK is not text".into()))?;
        let memo = (open(&c.memo_key, "memo-key")?)
            .try_into()
            .map_err(|_| Error::Config("sealed memo key is not 32 bytes".into()))?;
        let devtool = match (index, &c.devtool, &c.wallet_dir, &c.devtool_server) {
            (0, Some(bin), Some(wallet), Some(server)) => Some(Devtool {
                bin: bin.clone(),
                wallet: wallet.clone(),
                server: server.clone(),
            }),
            (0, ..) => {
                let need = "relayer 0 needs settlement.devtool, wallet_dir and devtool_server";
                return Err(Error::Config(need.into()));
            }
            _ => None,
        };
        Ok(Self {
            index,
            params: Params::parse(&c.network)?,
            fvk: zpredict_settle::decode_fvk(ufvk.trim())?,
            memo,
            share: crate::outcome::load_share(&c.key_share, index)?,
            start_height: c.start_height,
            confirmations: c.confirmations.max(1),
            devtool,
        })
    }

    pub fn memo_key(&self) -> MemoKey {
        MemoKey::from_bytes(self.memo)
    }

    /// Relayer `index`'s escrow from a test DKG, on regtest, without a devtool: every
    /// payout round fails at relayer 0, as on a host that can't reach the escrow wallet.
    #[cfg(test)]
    pub(crate) fn for_tests(index: usize, share: KeyShare, fvk: FullViewingKey) -> Self {
        Self {
            index,
            params: Params::parse("regtest").unwrap(),
            fvk,
            memo: [index as u8 + 1; 32],
            share,
            start_height: 1,
            confirmations: 1,
            devtool: None,
        }
    }
}
