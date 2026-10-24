//! What a scanned escrow note is worth to the order book.

use crate::memo::Tag;
use crate::{DENOMINATIONS, HALF_TICKS_PER_UNIT, UNIT_ZATS};

/// An escrow note: the transaction and the index of its action in the Ironwood bundle
/// (in the Orchard bundle for [`Flag::Orchard`]).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NoteId {
    pub txid: [u8; 32],
    pub action: usize,
}

/// A deposit the relayers credit: a fixed denomination with a readable deposit memo slot.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Deposit {
    pub note: NoteId,
    pub height: u32,
    pub units: u64,
    /// The account's public id ([`crate::memo::account_id`]).
    pub account: u64,
    /// This relayer's share of the account's credential ([`crate::memo::key_shares`]).
    pub key_share: Tag,
}

/// A note received by the escrow that is not credited to anyone.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Flagged {
    pub note: NoteId,
    pub height: u32,
    pub zats: u64,
    pub reason: Flag,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Flag {
    /// Not 1, 5 or 25 units: crediting it would reveal a bet size.
    Denomination,
    /// No deposit memo, or this relayer's slot does not open.
    NoTag,
    /// Sent to the Orchard pool, which is withdraw-only since NU6.3. Never credited,
    /// whatever its amount or memo; refunded by hand (`packages/settle/README.md`).
    Orchard,
}

/// The denomination of `zats`, if it is exactly one of [`DENOMINATIONS`].
pub fn units(zats: u64) -> Option<u64> {
    DENOMINATIONS
        .into_iter()
        .find(|u| u.checked_mul(UNIT_ZATS) == Some(zats))
}

impl Deposit {
    /// Relayer `relayer`'s initial XOR share of the credit, in half-ticks: `(A, 0, 0)`.
    /// Every relayer already sees `A` (shared viewing key); the first MPC batch
    /// re-randomises the shares (decision in #9).
    pub fn balance_share(&self, relayer: usize) -> u64 {
        if relayer == 0 {
            self.units * HALF_TICKS_PER_UNIT
        } else {
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_fixed_denominations_count() {
        assert_eq!(units(UNIT_ZATS), Some(1));
        assert_eq!(units(5 * UNIT_ZATS), Some(5));
        assert_eq!(units(25 * UNIT_ZATS), Some(25));
        for zats in [
            0,
            1,
            UNIT_ZATS - 1,
            2 * UNIT_ZATS,
            5 * UNIT_ZATS + 1,
            u64::MAX,
        ] {
            assert_eq!(units(zats), None, "{zats}");
        }
    }

    #[test]
    fn shares_xor_to_the_deposit() {
        let d = Deposit {
            note: NoteId {
                txid: [0; 32],
                action: 0,
            },
            height: 1,
            units: 5,
            account: 1,
            key_share: [0; 16],
        };
        let shares: Vec<u64> = (0..3).map(|r| d.balance_share(r)).collect();
        assert_eq!(shares, [1000, 0, 0]);
        assert_eq!(shares[0] ^ shares[1] ^ shares[2], 5 * HALF_TICKS_PER_UNIT);
    }
}
