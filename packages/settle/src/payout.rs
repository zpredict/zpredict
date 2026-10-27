//! The payout vector and the one batched PCZT that pays it.
//!
//! The prover relayer builds the PCZT from its escrow wallet (zcash_client_sqlite, kept
//! in sync by zcash-devtool) through `zcash_client_backend`'s proposal path: greedy note
//! selection, ZIP 317 fee, ZIP 315 expiry, change back to the escrow. Every payout goes
//! to the Orchard-shaped receiver of a user-supplied fresh unified address, which a v6
//! transaction carries in its Ironwood bundle; no transparent or Sapling receiver is
//! ever paid.

use std::convert::Infallible;
use std::path::Path;

use rand::rand_core::UnwrapErr;
use rand::rngs::SysRng;
use zcash_address::ZcashAddress;
use zcash_client_backend::data_api::WalletRead;
use zcash_client_backend::data_api::wallet::input_selection::{GreedyInputSelector, SpendPolicy};
use zcash_client_backend::data_api::wallet::{
    ConfirmationsPolicy, create_pczt_from_proposal, propose_transfer,
};
use zcash_client_backend::fees::standard::MultiOutputChangeStrategy;
use zcash_client_backend::fees::{DustOutputPolicy, SplitPolicy, StandardFeeRule};
use zcash_client_backend::wallet::OvkPolicy;
use zcash_client_sqlite::WalletDb;
use zcash_client_sqlite::util::SystemClock;
use zcash_client_sqlite::wallet::commitment_tree;
use zcash_keys::address::{Address, UnifiedAddress};
use zcash_primitives::transaction::builder::BundlePadding;
use zcash_protocol::ShieldedPool;
use zcash_protocol::consensus::Parameters;
use zcash_protocol::value::Zatoshis;
use zip321::{Payment, TransactionRequest};

use crate::error::{Error, Result};

/// One winner or withdrawal: an Orchard-shaped receiver and an amount.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Payout {
    pub to: orchard::Address,
    pub zats: u64,
}

impl Payout {
    /// A payout to the Orchard receiver of unified address `ua`. Anything that is not a
    /// unified address with an Orchard receiver is refused; other receivers are dropped.
    pub fn parse<P: Parameters>(params: &P, ua: &str, zats: u64) -> Result<Self> {
        let refuse = |why: &str| Error::Payout(why.to_string());
        let Some(Address::Unified(ua)) = Address::decode(params, ua) else {
            return Err(refuse("not a unified address for this network"));
        };
        let to = *ua.orchard().ok_or_else(|| refuse("no Ironwood receiver"))?;
        if zats == 0 {
            return Err(refuse("zero payout"));
        }
        Ok(Payout { to, zats })
    }

    /// The payout's receiver alone, as a unified address.
    pub fn address<P: Parameters>(&self, params: &P) -> String {
        UnifiedAddress::from_receivers(Some(self.to), None, None, None, None)
            .expect("an Orchard receiver is a valid unified address")
            .encode(params)
    }
}

/// Builds the unproven, unsigned PCZT paying `payouts` from the escrow wallet in
/// `wallet_dir` (a zcash-devtool wallet directory holding the escrow's watch-only UFVK).
pub fn create<P: Parameters + Clone>(
    params: &P,
    wallet_dir: &Path,
    payouts: &[Payout],
) -> Result<pczt::Pczt> {
    let fail = |what: &str, e: &dyn std::fmt::Display| Error::Payout(format!("{what}: {e}"));
    let mut db = WalletDb::for_path(
        wallet_dir.join("data.sqlite"),
        params.clone(),
        SystemClock,
        UnwrapErr(SysRng),
    )
    .map_err(|e| fail("wallet", &e))?;
    let account = match db.get_account_ids().map_err(|e| fail("wallet", &e))?[..] {
        [id] => id,
        _ => return Err(Error::Payout("escrow wallet must hold one account".into())),
    };

    let payments = payouts
        .iter()
        .map(|p| {
            let to = ZcashAddress::try_from_encoded(&p.address(params))
                .map_err(|e| fail("address", &e))?;
            let zats = Zatoshis::from_u64(p.zats).map_err(|e| fail("amount", &e))?;
            Ok(Payment::without_memo(to, zats))
        })
        .collect::<Result<Vec<_>>>()?;
    let request = TransactionRequest::new(payments).map_err(|e| fail("request", &e))?;

    // One change note back to the escrow (the pool argument is the fallback; with
    // Ironwood active the change follows the inputs into the Ironwood bundle).
    let change = MultiOutputChangeStrategy::new(
        StandardFeeRule::Zip317,
        None,
        ShieldedPool::Orchard,
        DustOutputPolicy::default(),
        SplitPolicy::single_output(),
    );
    let proposal = propose_transfer::<_, _, _, _, commitment_tree::Error>(
        &mut db,
        params,
        account,
        &GreedyInputSelector::new(),
        &change,
        request,
        ConfirmationsPolicy::default(),
        &SpendPolicy::default(),
        None,
        None,
    )
    .map_err(|e| fail("proposal", &e))?;
    create_pczt_from_proposal::<_, _, Infallible, _, Infallible, _>(
        &mut db,
        params,
        &SystemClock,
        &mut UnwrapErr(SysRng),
        account,
        // Outputs stay recoverable with the escrow's OVKs, which is how every signer
        // checks that each payout's ciphertext really decrypts to its note.
        OvkPolicy::Sender,
        &proposal,
        None,
        // Wallet-default padding (the Ironwood bundle's is derived from the proposal): a
        // payout then has the same shape as any wallet's send, not a zPredict-only arity.
        BundlePadding::DEFAULT,
    )
    .map_err(|e| fail("pczt", &e))
}

#[cfg(test)]
mod tests {
    use orchard::keys::{FullViewingKey, Scope, SpendingKey};

    use super::*;
    use crate::keys::regtest;

    #[test]
    fn pays_only_the_orchard_receiver_of_a_unified_address() {
        let fvk = FullViewingKey::from(&SpendingKey::from_bytes([5; 32]).unwrap());
        let to = fvk.address_at(3u32, Scope::External);
        let ua = UnifiedAddress::from_receivers(Some(to), None, None, None, None).unwrap();
        let p = Payout::parse(&regtest(), &ua.encode(&regtest()), 7).unwrap();
        assert_eq!(p, Payout { to, zats: 7 });
        assert_eq!(p.address(&regtest()), ua.encode(&regtest()));
        assert!(Payout::parse(&regtest(), &ua.encode(&regtest()), 0).is_err());
        let main = ua.encode(&zcash_protocol::consensus::Network::MainNetwork);
        assert!(Payout::parse(&regtest(), &main, 7).is_err());
        assert!(Payout::parse(&regtest(), "tmXYZ", 7).is_err());
    }
}
