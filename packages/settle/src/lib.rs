//! Settlement for zPredict's FROST 2-of-3 Ironwood escrow.
//!
//! - [`keys`]: the escrow viewing key and address from the FROST group key.
//! - [`memo`], [`scan`], [`deposit`]: each relayer scans the escrow with the shared
//!   viewing key, reads the account tag encrypted to it in the deposit memo, accepts
//!   only fixed denominations and credits the initial balance share `(A, 0, 0)`.
//! - [`payout`]: one batched PCZT paying the payout vector to fresh Ironwood
//!   receivers, change back to the escrow, ZIP 317 fee, wallet-default padding.
//! - [`verify`], [`frost`]: every signer recomputes the sighash and checks every output
//!   against the payout vector before signing; one FROST session covers all spends.
//! - [`sign`]: the sighash and randomizers FROST signs from a PCZT, and applying the
//!   signatures. Replaces `zcash-sign` from frost-zcash-demo, whose pinned
//!   librustzcash cannot parse NU7 (branch ID `0x77190AD9`) PCZTs.
//! - [`store`]: relayer secrets (viewing key, memo key) and [`share`]s sealed at rest.

pub mod deposit;
pub mod dkg;
pub mod error;
#[cfg(test)]
mod fixture;
pub mod frost;
pub mod keys;
pub mod memo;
pub mod outcome;
pub mod payout;
pub mod scan;
pub mod share;
pub mod sign;
pub mod store;
pub mod verify;

pub use deposit::{Deposit, Flag, Flagged, NoteId};
pub use dkg::dkg_local;
pub use error::{Error, Result};
pub use frost::{SignRequest, sign_all, verify_then_sign};
pub use keys::{EscrowKeys, Params, decode_fvk, escrow_keys};
pub use memo::{MemoKey, Tag};
pub use payout::Payout;
pub use scan::{Scanned, Scanner};
pub use share::KeyShare;
pub use sign::{Pool, Randomizer, SpendSig, apply, randomizers, sighash};
pub use verify::verify;

/// Types the relayer names when it carries FROST rounds and PCZTs between hosts.
pub use orchard::keys::FullViewingKey;
pub use pczt::Pczt;
pub use reddsa::frost::redpallas;

/// Relayers in the escrow committee (FROST 2-of-3, MPC 3-of-3).
pub const RELAYERS: usize = 3;
/// Signers needed to spend from the escrow.
pub const THRESHOLD: u16 = 2;
/// Zatoshis in one unit of collateral (0.01 ZEC): the only place the mapping lives.
/// Small enough that testnet coins cover a demo, and 100x the minimum ZIP 317 fee.
pub const UNIT_ZATS: u64 = 1_000_000;
/// The only deposit sizes credited, in units (0.01, 0.05, 0.25, 1, 5 and 25 ZEC); any other
/// amount is flagged, not credited. A larger deposit is several of these in one transaction.
pub const DENOMINATIONS: [u64; 6] = [1, 5, 25, 100, 500, 2500];
/// Balances are in half-ticks: one unit of collateral is 200 (DESIGN.md, Relayer API).
pub const HALF_TICKS_PER_UNIT: u64 = 200;
