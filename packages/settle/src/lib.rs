//! FROST 2-of-3 signing glue for zPredict's Ironwood escrow.
//!
//! The escrow's spend authority (`ak`) is the FROST group key. This crate turns that
//! key into a viewing key and address ([`keys`]), reads the sighash and randomizers a
//! FROST coordinator must sign from a zcash-devtool PCZT, and puts the resulting
//! signatures back ([`sign`]). It replaces `zcash-sign` from frost-zcash-demo, whose
//! pinned librustzcash cannot parse NU7 (branch ID `0x77190AD9`) PCZTs.

pub mod error;
pub mod keys;
pub mod sign;

pub use error::{Error, Result};
pub use keys::{EscrowKeys, escrow_keys};
pub use sign::{Pool, Randomizer, SpendSig, apply, randomizers, sighash};
