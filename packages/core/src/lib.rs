//! Order encoding, XOR secret shares, and the plaintext clearing rule.
//!
//! The browser splits each encoded order into three XOR shares, one per relayer.
//! The MPC circuit rebuilds the orders and runs [`clear`]; this module is the
//! reference that circuit is tested against, so the two must agree bit for bit.

mod clearing;
mod fill;
mod order;
mod shares;

pub use clearing::{Fill, clear};
pub use fill::fill_records;
pub use order::{Order, Side};
pub use shares::{combine, split};

/// Prices are in ticks of 1/100 of a unit: a YES bid at 63 pays up to 0.63.
pub const TICKS: u16 = 100;
/// Encoded order length in bytes; also the share length.
pub const ORDER_LEN: usize = 18;
/// Per-order fill record length; also the fill share length.
pub const FILL_LEN: usize = 10;
/// Largest order size accepted, so a fill's total cost always fits in its u32 field.
pub const MAX_SIZE: u32 = 1_000_000;
