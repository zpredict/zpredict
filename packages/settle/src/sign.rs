//! Reading what FROST must sign from a PCZT, and applying the signatures it returns.

use ff::PrimeField;
use orchard::primitives::redpallas::{Signature, SpendAuth};
use pczt::Pczt;
use pczt::roles::low_level_signer::{OrchardParseError, Signer};
use zcash_primitives::transaction::sighash::{PrecomputedSighashData, SignableInput};

use crate::error::{Error, Result};

/// The two Orchard-shaped bundles of a v6 transaction.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pool {
    Orchard,
    Ironwood,
}

impl Pool {
    /// A v6 tx carries both bundles, and asking the signer for the wrong one returns
    /// no spends rather than an error, so every pass visits both.
    pub const ALL: [Pool; 2] = [Pool::Orchard, Pool::Ironwood];

    pub fn name(self) -> &'static str {
        match self {
            Pool::Orchard => "orchard",
            Pool::Ironwood => "ironwood",
        }
    }

    pub fn parse(s: &str) -> Result<Self> {
        match s {
            "orchard" => Ok(Pool::Orchard),
            "ironwood" => Ok(Pool::Ironwood),
            _ => Err(Error::Usage(format!("unknown pool {s:?}"))),
        }
    }
}

/// One spend awaiting a FROST signature: its bundle, action index and randomizer.
pub struct Randomizer {
    pub pool: Pool,
    pub index: usize,
    pub alpha: [u8; 32],
}

/// A 64-byte RedPallas spend-auth signature for one action.
pub struct SpendSig {
    pub pool: Pool,
    pub index: usize,
    pub sig: [u8; 64],
}

/// The shielded sighash. `PrecomputedSighashData` picks the v6 (Ironwood) or v5 rule
/// from the transaction version, so a v6 tx can never be signed with the v5 hash.
pub fn sighash(pczt: &Pczt) -> Result<[u8; 32]> {
    let tx = pczt
        .clone()
        .into_effects()
        .map_err(|e| Error::Sighash(format!("{e:?}")))?;
    let data = PrecomputedSighashData::new_zip244(tx)
        .map_err(|_| Error::Sighash("pre-v5 transaction".into()))?;
    Ok(*data.signature_hash(&SignableInput::Shielded).as_ref())
}

/// Every real spend still awaiting a signature. Dummy spends were signed when the
/// PCZT was created; real ones carry their randomizer `alpha`.
pub fn randomizers(pczt: &Pczt) -> Result<Vec<Randomizer>> {
    let mut out = vec![];
    let mut signer = Signer::new(pczt.clone());
    for pool in Pool::ALL {
        signer = with_bundle(signer, pool, |bundle| {
            for (index, action) in bundle.actions_mut().iter().enumerate() {
                if action.spend().spend_auth_sig().is_none()
                    && let Some(alpha) = action.spend().alpha()
                {
                    out.push(Randomizer {
                        pool,
                        index,
                        alpha: alpha.to_repr(),
                    });
                }
            }
            Ok(())
        })?;
    }
    Ok(out)
}

/// Applies FROST signatures. Each is checked against its spend's `rk` first.
pub fn apply(pczt: Pczt, sigs: &[SpendSig]) -> Result<Pczt> {
    let hash = sighash(&pczt)?;
    let mut signer = Signer::new(pczt);
    for pool in Pool::ALL {
        let mine: Vec<&SpendSig> = sigs.iter().filter(|s| s.pool == pool).collect();
        if mine.is_empty() {
            continue;
        }
        signer = with_bundle(signer, pool, |bundle| {
            for s in mine {
                bundle
                    .actions_mut()
                    .get_mut(s.index)
                    .ok_or_else(|| Error::Signature(format!("no action {}", s.index)))?
                    .apply_signature(hash, Signature::<SpendAuth>::from(s.sig))
                    .map_err(|e| Error::Signature(format!("action {}: {e:?}", s.index)))?;
            }
            Ok(())
        })?;
    }
    Ok(signer.finish())
}

/// Runs `f` over one pool's bundle.
fn with_bundle<F>(signer: Signer, pool: Pool, f: F) -> Result<Signer>
where
    F: FnOnce(&mut orchard::pczt::Bundle) -> Result<()>,
{
    struct E(Error);
    impl From<OrchardParseError> for E {
        fn from(e: OrchardParseError) -> Self {
            E(Error::Pczt(format!("{e:?}")))
        }
    }
    let run = |_: &Pczt, b: &mut orchard::pczt::Bundle, _: &mut u8| f(b).map_err(E);
    match pool {
        Pool::Orchard => signer.sign_orchard_with(run),
        Pool::Ironwood => signer.sign_ironwood_with(run),
    }
    .map_err(|E(e)| e)
}
