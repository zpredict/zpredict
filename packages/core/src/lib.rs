//! Order encoding, XOR secret shares, and the plaintext clearing rule.
//!
//! The browser splits each encoded order into three XOR shares, one per relayer.
//! The MPC circuit rebuilds the orders and runs [`clear`]; this module is the
//! reference that circuit is tested against, so the two must agree bit for bit.

mod balance;
mod clearing;
mod fill;
mod order;
mod settle;
mod shares;

pub use balance::{Account, Cleared, clear_with_balances, worst_case_cost};
pub use clearing::{Fill, clear, clearing_price};
pub use fill::fill_records;
pub use order::{Order, Side};
pub use settle::{Withdrawal, apply_flows, resolve};
pub use shares::{combine, split};

/// Prices are in ticks of 1/100 of a unit: a YES bid at 63 pays up to 0.63.
pub const TICKS: u16 = 100;
/// Encoded order length in bytes; also the share length.
pub const ORDER_LEN: usize = 18;
/// Per-order fill record length; also the fill share length.
pub const FILL_LEN: usize = 10;
/// Encoded balance-table row length (`id u64 | balance u64`); also its share length.
pub const ACCOUNT_LEN: usize = 16;
/// Balance share length: `u64` half-ticks.
pub const BALANCE_LEN: usize = 8;
/// Half-ticks in one unit of collateral; a winning contract pays one unit.
pub const HALF_TICKS_PER_UNIT: u64 = 200;
/// Largest order size accepted, so a fill's total cost always fits in its u32 field.
pub const MAX_SIZE: u32 = 1_000_000;
