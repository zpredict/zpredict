//! Finding deposits: trial-decrypt Ironwood outputs with the shared escrow viewing key.
//!
//! Compact blocks carry no memo, so the scanner fetches every block's transactions
//! that have Ironwood actions in full from lightwalletd (the same client the oracle
//! uses) and decrypts them here. Only the external scope is scanned: deposits arrive
//! at the escrow's public address, while the escrow's own change goes to its internal
//! scope and is never a deposit.

use orchard::bundle::Authorization;
use orchard::keys::{FullViewingKey, IncomingViewingKey, Scope};
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::BranchId;
use zpredict_oracle::Lightwalletd;

use crate::deposit::{Deposit, Flag, Flagged, NoteId, units};
use crate::error::{Error, Result};
use crate::memo::{self, MemoKey};

/// One scanned escrow note: credited, or flagged and left alone.
pub type Scanned = std::result::Result<Deposit, Flagged>;

/// Relayer `relayer`'s view of the escrow.
pub struct Scanner {
    ivk: IncomingViewingKey,
    relayer: usize,
    key: MemoKey,
}

impl Scanner {
    pub fn new(fvk: &FullViewingKey, relayer: usize, key: MemoKey) -> Self {
        Scanner {
            ivk: fvk.to_ivk(Scope::External),
            relayer,
            key,
        }
    }

    /// Escrow notes in blocks `from..=to`, in chain order.
    pub fn blocks(&self, lwd: &Lightwalletd, from: u32, to: u32) -> Result<Vec<Scanned>> {
        let mut out = vec![];
        for height in from..=to {
            for raw in lwd
                .ironwood_txs(height)
                .map_err(|e| Error::Chain(e.to_string()))?
            {
                out.extend(self.tx(&raw, height)?);
            }
        }
        Ok(out)
    }

    /// Escrow notes in one serialized transaction mined at `height`.
    pub fn tx(&self, raw: &[u8], height: u32) -> Result<Vec<Scanned>> {
        // v5+ transactions carry their own branch ID; the argument only matters for v4.
        let tx = Transaction::read(raw, BranchId::Nu7)?;
        let txid = *tx.txid().as_ref();
        Ok(tx
            .ironwood_bundle()
            .map(|b| self.bundle(b, txid, height))
            .unwrap_or_default())
    }

    /// Escrow notes in an Ironwood bundle of transaction `txid`.
    pub fn bundle<A: Authorization, V>(
        &self,
        bundle: &orchard::Bundle<A, V>,
        txid: [u8; 32],
        height: u32,
    ) -> Vec<Scanned> {
        bundle
            .decrypt_outputs_with_keys(std::slice::from_ref(&self.ivk))
            .into_iter()
            .map(|(action, _, note, _, memo)| {
                let note_id = NoteId { txid, action };
                let zats = note.value().inner();
                let flag = |reason| Flagged {
                    note: note_id,
                    height,
                    zats,
                    reason,
                };
                let units = units(zats).ok_or(flag(Flag::Denomination))?;
                let tag = memo::decode(&memo, self.relayer, &self.key).ok_or(flag(Flag::NoTag))?;
                Ok(Deposit {
                    note: note_id,
                    height,
                    units,
                    tag,
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use orchard::builder::{Builder, BundleType};
    use orchard::bundle::BundleVersion;
    use orchard::keys::SpendingKey;
    use orchard::value::NoteValue;
    use orchard::{Address, Anchor};
    use rand::rand_core::UnwrapErr;
    use rand::rngs::SysRng;

    use super::*;
    use crate::UNIT_ZATS;

    fn output(b: &mut Builder, to: Address, zats: u64, memo: [u8; 512]) {
        b.add_output(None, to, NoteValue::from_raw(zats), memo)
            .unwrap();
    }

    #[test]
    fn credits_fixed_denominations_with_a_tag_and_flags_the_rest() {
        let fvk = FullViewingKey::from(&SpendingKey::from_bytes([1; 32]).unwrap());
        let foreign = FullViewingKey::from(&SpendingKey::from_bytes([2; 32]).unwrap());
        let keys = [
            MemoKey::generate(),
            MemoKey::generate(),
            MemoKey::generate(),
        ];
        let pks = keys.each_ref().map(MemoKey::public);
        let tagged = memo::encode(&[7; 16], &pks);
        let escrow = fvk.address_at(0u32, Scope::External);
        let change = fvk.address_at(0u32, Scope::Internal);

        let v = BundleVersion::ironwood_v3();
        let mut b = Builder::new(
            BundleType::DEFAULT,
            v,
            v.default_flags(),
            Anchor::empty_tree(),
        )
        .unwrap();
        output(&mut b, escrow, 5 * UNIT_ZATS, tagged);
        output(&mut b, escrow, 3 * UNIT_ZATS, tagged);
        output(&mut b, escrow, UNIT_ZATS, [0xF6; 512]);
        output(&mut b, change, 25 * UNIT_ZATS, tagged);
        output(
            &mut b,
            foreign.address_at(0u32, Scope::External),
            UNIT_ZATS,
            tagged,
        );
        let (bundle, _) = b.build::<i64>(UnwrapErr(SysRng)).unwrap().unwrap();

        for (relayer, key) in keys.into_iter().enumerate() {
            let mut found = Scanner::new(&fvk, relayer, key).bundle(&bundle, [0; 32], 9);
            found.sort_by_key(|s| match s {
                Ok(d) => (0, d.units),
                Err(f) => (1, f.zats),
            });
            assert_eq!(
                found.len(),
                3,
                "change and foreign outputs are not deposits"
            );
            let d = found[0].as_ref().unwrap();
            assert_eq!((d.units, d.tag, d.height), (5, [7; 16], 9));
            assert_eq!(
                d.balance_share(relayer),
                if relayer == 0 { 1000 } else { 0 }
            );
            let f: Vec<_> = found[1..].iter().map(|s| s.clone().unwrap_err()).collect();
            assert_eq!((f[0].zats, f[0].reason), (UNIT_ZATS, Flag::NoTag));
            assert_eq!(
                (f[1].zats, f[1].reason),
                (3 * UNIT_ZATS, Flag::Denomination)
            );
        }
    }
}
