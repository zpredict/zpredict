//! Test fixture: a 2-of-3 FROST escrow (from the DKG) holding two 5-unit notes, and a
//! payout PCZT built the way the wallet builds one: two payouts, change to the escrow's
//! internal scope, Ironwood only, default padding, ZIP 317 fee.

use incrementalmerkletree::{Hashable, Level};
use orchard::keys::{FullViewingKey, Scope, SpendingKey};
use orchard::note::{Note, NoteVersion, RandomSeed, Rho};
use orchard::tree::{MerkleHashOrchard, MerklePath};
use orchard::value::NoteValue;
use pczt::Pczt;
use pczt::roles::{creator::Creator, io_finalizer::IoFinalizer};
use rand::rand_core::UnwrapErr;
use rand::rngs::SysRng;
use zcash_primitives::transaction::builder::{BuildConfig, Builder, BundlePadding};
use zcash_primitives::transaction::fees::zip317::FeeRule;
use zcash_protocol::memo::MemoBytes;
use zcash_protocol::value::Zatoshis;

use crate::dkg::dkg_local;
use crate::payout::Payout;
use crate::share::KeyShare;
use crate::{UNIT_ZATS, keys::fvk_from_ak, keys::regtest};

pub struct Fixture {
    pub shares: Vec<KeyShare>,
    pub fvk: FullViewingKey,
    pub payouts: Vec<Payout>,
    pub pczt: Pczt,
}

/// Fresh keys and a fresh PCZT; `to` can redirect the second payout's output.
pub fn fixture(to: Option<orchard::Address>) -> Fixture {
    let shares = dkg_local().unwrap();
    let fvk = fvk_from_ak(&shares[0].ak().unwrap()).unwrap();

    let deposit = 5 * UNIT_ZATS;
    let notes: Vec<Note> = (1u8..=2).map(|i| note(&fvk, deposit, i)).collect();
    let cmx: Vec<MerkleHashOrchard> = notes
        .iter()
        .map(|n| MerkleHashOrchard::from_cmx(&n.commitment().into()))
        .collect();
    let path = |pos: usize| {
        let mut auth = [MerkleHashOrchard::empty_leaf(); 32];
        auth[0] = cmx[1 - pos];
        for (l, a) in auth.iter_mut().enumerate().skip(1) {
            *a = MerkleHashOrchard::empty_root(Level::from(l as u8));
        }
        MerklePath::from_parts(pos as u32, auth)
    };
    let anchor = path(0).root(notes[0].commitment().into());

    let winner = |i: u32| {
        FullViewingKey::from(&SpendingKey::from_bytes([40 + i as u8; 32]).unwrap())
            .address_at(i, Scope::External)
    };
    let payouts = vec![
        Payout {
            to: winner(1),
            zats: 3 * UNIT_ZATS,
        },
        Payout {
            to: winner(2),
            zats: 4 * UNIT_ZATS,
        },
    ];
    // 2 spends and 3 outputs make 3 actions: a ZIP 317 fee of 3 × 5,000 zats.
    let fee = 15_000;
    let change = 2 * deposit - 7 * UNIT_ZATS - fee;

    let config = BuildConfig::Standard {
        sapling_anchor: None,
        orchard_anchor: None,
        ironwood_anchor: Some(anchor),
        orchard_padding: BundlePadding::DEFAULT,
        ironwood_padding: BundlePadding::DEFAULT,
    };
    let mut b = Builder::new(regtest(), 200.into(), config);
    for (i, n) in notes.into_iter().enumerate() {
        b.add_ironwood_spend::<()>(fvk.clone(), n, path(i)).unwrap();
    }
    let ext = Some(fvk.to_ovk(Scope::External));
    let mut out = |ovk, to, zats| {
        b.add_ironwood_output::<()>(ovk, to, Zatoshis::const_from_u64(zats), MemoBytes::empty())
            .unwrap()
    };
    out(ext.clone(), payouts[0].to, payouts[0].zats);
    out(ext, to.unwrap_or(payouts[1].to), payouts[1].zats);
    let internal = fvk.address_at(0u32, Scope::Internal);
    out(Some(fvk.to_ovk(Scope::Internal)), internal, change);

    let built = b
        .build_for_pczt(UnwrapErr(SysRng), &FeeRule::standard())
        .unwrap();
    let pczt = Creator::build_from_parts(built.pczt_parts).unwrap();
    let pczt = IoFinalizer::new(pczt)
        .finalize_io(UnwrapErr(SysRng))
        .unwrap();
    Fixture {
        shares,
        fvk,
        payouts,
        pczt,
    }
}

fn note(fvk: &FullViewingKey, zats: u64, i: u8) -> Note {
    let rho = Rho::from_bytes(&[i; 32]).unwrap();
    (0u8..)
        .find_map(|k| {
            let rseed = Option::from(RandomSeed::from_bytes([k; 32], &rho))?;
            let to = fvk.address_at(0u32, Scope::External);
            Option::from(Note::from_parts(
                to,
                NoteValue::from_raw(zats),
                rho,
                rseed,
                NoteVersion::V3,
            ))
        })
        .unwrap()
}
