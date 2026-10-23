//! "Mirror a Polymarket market": same question as a binary Yes/No Polymarket market,
//! traded privately on zPredict's own book. YES iff Polymarket resolved its "Yes" outcome
//! to 1. The oracle for these markets is Polymarket (UMA); a relayer only attests what
//! Polymarket's public Gamma API published, and the three relayers fetch it independently.
//!
//! Params: `{"conditionId": "0x…64 hex", "slug": "will-…"}`. The record is read by slug
//! (`GET /markets/slug/<slug>`: the `?condition_ids=` filter hides closed markets) and must
//! carry the same conditionId, outcomes exactly `["Yes", "No"]`.
//!
//! Gamma semantics, checked live on 2026-10-23: a market is settled once `closed` is true
//! **and** `umaResolutionStatus` is `"resolved"`; `outcomePrices` are then the payouts
//! (`["1","0"]` = Yes won, `["0","1"]` = No, `["0.5","0.5"]` = a 50-50 split, which is NO
//! here: Yes did not resolve to 1). Before that the prices are the live mid prices, and a
//! proposed or disputed UMA answer shows `closed: false`. Responses are CloudFront-cached
//! (`max-age=300`), so [`Polymarket`] fetches each market at most once per [`TTL`].

mod client;
mod gamma;

pub use client::{Point, Polymarket};
pub use gamma::{GammaMarket, Params};

use std::time::Duration;

/// Plugin name in market configs.
pub const PLUGIN: &str = "polymarket";
/// Gamma (market records), CLOB (price history) and the public market page.
pub const GAMMA: &str = "https://gamma-api.polymarket.com";
pub const CLOB: &str = "https://clob.polymarket.com";
pub const SITE: &str = "https://polymarket.com/market/";
/// How long a fetched record (or a failed fetch) is reused: Gamma's own `max-age`.
pub const TTL: Duration = Duration::from_secs(300);
/// Per-request timeout; there are no retries, the next poll after [`TTL`] is the retry.
pub const TIMEOUT: Duration = Duration::from_secs(10);
