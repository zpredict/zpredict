//! Settlement for zPredict's FROST 2-of-3 Ironwood escrow.
//!
//! - [`keys`]: the escrow viewing key and address from the FROST group key.
//! - [`memo`], [`scan`], [`deposit`]: each relayer scans the escrow with the shared
//!   viewing key, reads the account tag encrypted to it in the deposit memo, accepts
//!   only fixed denominations and credits the initial balance share `(A, 0, 0)`.
//! - [`sign`]: the sighash and randomizers FROST signs from a PCZT, and applying the
//!   signatures. Replaces `zcash-sign` from frost-zcash-demo, whose pinned
//!   librustzcash cannot parse NU7 (branch ID `0x77190AD9`) PCZTs.
//! - [`store`]: relayer secrets sealed at rest.

pub mod deposit;
pub mod error;
pub mod keys;
pub mod memo;
pub mod scan;
pub mod sign;
pub mod store;

pub use deposit::{Deposit, Flag, Flagged, NoteId};
pub use error::{Error, Result};
pub use keys::{EscrowKeys, decode_fvk, escrow_keys};
pub use memo::{MemoKey, Tag};
pub use scan::{Scanned, Scanner};
pub use sign::{Pool, Randomizer, SpendSig, apply, randomizers, sighash};

/// Relayers in the escrow committee (FROST 2-of-3, MPC 3-of-3).
pub const RELAYERS: usize = 3;
/// Zatoshis in one unit of collateral (0.01 ZEC): the only place the mapping lives.
/// Small enough that testnet coins cover a demo, and 100x the minimum ZIP 317 fee.
pub const UNIT_ZATS: u64 = 1_000_000;
/// The only deposit sizes credited, in units; any other amount is flagged, not credited.
pub const DENOMINATIONS: [u64; 3] = [1, 5, 25];
/// Balances are in half-ticks: one unit of collateral is 200 (DESIGN.md, Relayer API).
pub const HALF_TICKS_PER_UNIT: u64 = 200;
