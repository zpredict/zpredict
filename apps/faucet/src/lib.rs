//! zPredict testnet faucet (#133): sends one fixed 1-unit (0.01 TAZ) shielded deposit to
//! the escrow with a deposit memo the browser built for its own account, so the relayers
//! credit it like any other deposit. The faucet never sees the account tag.
//!
//! Anti-abuse with no per-IP state: Cloudflare Turnstile ([`turnstile`], the one third
//! party, faucet only), a hashcash proof of work over a server-issued challenge ([`pow`]),
//! one drop per interval and a daily cap ([`limit`]). Nothing here logs request data or
//! reads the caller's address.

pub mod api;
pub mod devtool;
pub mod limit;
pub mod memo;
pub mod pow;
pub mod turnstile;

/// Zatoshis in one drop: one unit of collateral (`zpredict_settle::UNIT_ZATS`).
pub const DROP_ZATS: u64 = 1_000_000;
/// ZIP 317 fee of a drop: 2 logical actions (one shielded spend, one output) x 5,000 zats.
/// A faucet holding a few large notes may pay a little more; this is the floor.
pub const FEE_ZATS: u64 = 10_000;
