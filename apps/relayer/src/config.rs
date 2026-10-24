//! Relayer settings: a TOML file, with any top-level scalar overridable by an env var
//! `ZPREDICT_<KEY>` (e.g. `ZPREDICT_WEB_ORIGIN`, `ZPREDICT_JUDGE=false`).

use std::net::SocketAddr;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use zpredict_oracle::Market;

use crate::error::{Error, Result};
use crate::markets::{ROLLING_ID_BASE, Rolling};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Network {
    Mainnet,
    Testnet,
    Regtest,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// This relayer's party index, 0..=2.
    pub index: usize,
    pub network: Network,
    /// Public HTTP API.
    pub listen: SocketAddr,
    /// Noise peer addresses in party order; this relayer listens on `peers[index]`.
    pub peers: [SocketAddr; 3],
    /// This relayer's Noise private key file (hex, from `zpredict-relayer keygen`).
    pub key_file: PathBuf,
    /// The three parties' Noise public key files, in party order.
    pub peer_keys: [PathBuf; 3],
    /// The only origin CORS allows, e.g. `https://app.zpredict.site`.
    pub web_origin: String,
    /// lightwalletd for the chain the markets are about (mainnet): tip height for
    /// `/health` and market progress, and the oracle resolvers. `""` turns polling off
    /// (height stays 0, markets stay as configured).
    #[serde(default = "default_oracle_lightwalletd")]
    pub oracle_lightwalletd: String,
    /// lightwalletd for the chain the escrow lives on (testnet or regtest), for deposit
    /// scanning and settlement (`packages/settle`). Never used for market data.
    #[serde(default = "default_escrow_lightwalletd")]
    pub escrow_lightwalletd: String,
    /// Order slots per MPC batch (N), shared by all open markets; 2..=21. Crossing costs
    /// ~N² AND gates: 8 ≈ 5 s, 16 ≈ 13 s per window on an M4 Pro at 32 rows (#66).
    pub batch_size: usize,
    /// Balance-table rows per batch, i.e. funded accounts the deployment can hold. Each
    /// row costs ~6k AND gates; preprocessing on an M4 Pro is 5.7 s at 32, 8.0 s at 48,
    /// 10 s at 64 rows (#99).
    #[serde(default = "default_table_rows")]
    pub table_rows: usize,
    pub window_secs: u64,
    /// A pending order not in any batch for this many batches becomes `unfilled`.
    pub expire_batches: u64,
    /// `POST /judge/claim` (mock credit); refused on mainnet.
    #[serde(default)]
    pub judge: bool,
    /// Judge credit in half-ticks.
    #[serde(default)]
    pub judge_credit: u64,
    /// This relayer's deposit-memo public key (hex), as printed by `settle memo-key`,
    /// served at `GET /memo-key`. The sealed secret half stays with the escrow scanner.
    #[serde(default)]
    pub memo_key_file: Option<PathBuf>,
    /// Sealed FROST key share (`settle-payout dkg` writes `rN-share.sealed`), opened with
    /// `ZPREDICT_STORE_KEY`. With it, resolved outcomes are FROST-signed 2-of-3 and
    /// `/group-key` serves the group key; without it they stay "resolved (unsigned)".
    #[serde(default)]
    pub frost_share_file: Option<PathBuf>,
    /// Event log and `markets.json` directory (see `store.rs`, `markets/saved.rs`).
    pub data_dir: PathBuf,
    /// Use the plaintext dev matcher (needs the `dev-insecure` feature too).
    #[serde(default)]
    pub insecure_matcher: bool,
    /// Hourly rolling markets (`markets/rolling.rs`); absent = off.
    #[serde(default)]
    pub rolling: Option<Rolling>,
    /// Real deposits and payouts (`[settlement]`); absent, deposits come only from judge
    /// mode and nothing is paid out. Turn on once the escrow key ceremony is done.
    #[serde(default)]
    pub settlement: Option<Settlement>,
    pub markets: Vec<Market>,
}

/// The escrow side of a relayer. The three secrets are sealed files
/// (`zpredict_settle::store`, key in `ZPREDICT_STORE_KEY`) from the key ceremony.
#[derive(Clone, Debug, Deserialize)]
pub struct Settlement {
    /// The escrow's network: `main`, `test` or `regtest`.
    pub network: String,
    /// Sealed escrow UFVK (shared by all three).
    pub ufvk: PathBuf,
    /// Sealed memo key: opens this relayer's slot in deposit memos.
    pub memo_key: PathBuf,
    /// Sealed FROST key share.
    pub key_share: PathBuf,
    /// First escrow block to scan.
    pub start_height: u32,
    /// Blocks a deposit needs before it is credited (payouts spend after 10).
    #[serde(default = "default_confirmations")]
    pub confirmations: u32,
    /// Relayer 0 only, the prover: the zcash-devtool binary, its escrow wallet (unsealed
    /// by the operator, ideally on tmpfs) and the lightwalletd it syncs and broadcasts to.
    pub devtool: Option<PathBuf>,
    pub wallet_dir: Option<PathBuf>,
    pub devtool_server: Option<String>,
}

fn default_confirmations() -> u32 {
    10
}

/// `ZPREDICT_*` variables that are not config keys: `ZPREDICT_STORE_KEY` unseals the
/// settle secrets (`zpredict_settle::store`) and must never become a config value.
const NOT_CONFIG: [&str; 1] = ["store_key"];

fn default_oracle_lightwalletd() -> String {
    "https://zec.rocks:443".into()
}

fn default_table_rows() -> usize {
    zpredict_circuit::DEFAULT_ROWS
}

fn default_escrow_lightwalletd() -> String {
    "https://testnet.zec.rocks:443".into()
}

impl Config {
    /// Reads `path`, applies `ZPREDICT_*` env overrides, resolves relative paths against
    /// the file's directory and validates.
    pub fn load(path: &Path) -> Result<Self> {
        let text = std::fs::read_to_string(path)?;
        let env = std::env::vars().filter_map(|(k, v)| {
            let key = k.strip_prefix("ZPREDICT_")?.to_lowercase();
            Some((key, v))
        });
        let mut c = Self::parse(&text, env)?;
        let base = path.parent().unwrap_or(Path::new("."));
        for p in [&mut c.key_file, &mut c.data_dir]
            .into_iter()
            .chain(c.peer_keys.iter_mut())
            .chain(c.memo_key_file.as_mut())
            .chain(c.frost_share_file.as_mut())
            .chain(c.settlement.iter_mut().flat_map(|s| {
                [&mut s.ufvk, &mut s.memo_key, &mut s.key_share]
                    .into_iter()
                    .chain(s.devtool.as_mut())
                    .chain(s.wallet_dir.as_mut())
            }))
        {
            *p = base.join(&*p);
        }
        Ok(c)
    }

    pub fn parse(text: &str, env: impl Iterator<Item = (String, String)>) -> Result<Self> {
        let mut table: toml::Table =
            toml::from_str(text).map_err(|e| Error::Config(e.to_string()))?;
        for (key, raw) in env.filter(|(k, _)| !NOT_CONFIG.contains(&k.as_str())) {
            // Typed like the TOML literal it replaces: numbers and booleans parse, else string.
            let value = toml::from_str::<toml::Table>(&format!("v = {raw}"))
                .ok()
                .and_then(|mut t| t.remove("v"))
                .unwrap_or(toml::Value::String(raw));
            table.insert(key, value);
        }
        let c: Self = table.try_into().map_err(|e| Error::Config(e.to_string()))?;
        c.validate()?;
        Ok(c)
    }

    fn validate(&self) -> Result<()> {
        let bad = |m: &str| Err(Error::Config(m.into()));
        if self.index > 2 {
            return bad("index must be 0, 1 or 2");
        }
        if self.judge && self.network == Network::Mainnet {
            return bad("judge mode is testnet/regtest only");
        }
        if self.batch_size == 0 || self.window_secs == 0 || self.expire_batches == 0 {
            return bad("batch_size, window_secs and expire_batches must be positive");
        }
        if self.web_origin.ends_with('/') || !self.web_origin.contains("://") {
            return bad("web_origin must be an origin like https://app.example");
        }
        if self
            .markets
            .iter()
            .any(|m| m.id == 0 || m.id >= ROLLING_ID_BASE)
        {
            return bad("market ids must be 1..1000000 (rolling markets use the rest)");
        }
        // Mirrored markets: params here; that each is a binary Yes/No market is checked
        // against Gamma at startup (`reference::check`).
        crate::reference::mirrored(&self.markets).map_err(|e| Error::Config(e.to_string()))?;
        match &self.rolling {
            Some(r) => r.validate().map_err(Error::Config),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub const EXAMPLE: &str = include_str!("../config/r0.toml");

    #[test]
    fn example_parses_and_env_overrides() {
        let c = Config::parse(EXAMPLE, std::iter::empty()).unwrap();
        assert_eq!((c.index, c.batch_size), (0, 8));
        assert!(!c.markets.is_empty());
        let env = [
            ("web_origin".into(), "https://app.zpredict.site".into()),
            ("window_secs".into(), "30".into()),
            ("judge".into(), "false".into()),
        ];
        let c = Config::parse(EXAMPLE, env.into_iter()).unwrap();
        assert_eq!(c.web_origin, "https://app.zpredict.site");
        assert_eq!((c.window_secs, c.judge), (30, false));
    }

    #[test]
    fn oracle_and_escrow_chains_and_listen_from_env() {
        let c = Config::parse(EXAMPLE, std::iter::empty()).unwrap();
        assert_eq!(c.oracle_lightwalletd, "https://zec.rocks:443");
        assert_eq!(c.escrow_lightwalletd, "https://testnet.zec.rocks:443");
        let prod = include_str!("../../../deploy/production/relayer.toml");
        let env = [
            ("index".into(), "2".into()),
            ("listen".into(), "127.0.0.1:3174".into()),
            ("oracle_lightwalletd".into(), String::new()),
        ];
        let c = Config::parse(prod, env.into_iter()).unwrap();
        assert_eq!((c.index, c.listen.port()), (2, 3174));
        assert_eq!(c.oracle_lightwalletd, "", "empty turns oracle polling off");
        assert_eq!(c.escrow_lightwalletd, "https://testnet.zec.rocks:443");
        let r = c.rolling.expect("production runs rolling markets");
        assert_eq!(
            (r.interval_secs, r.horizon_secs, r.fast_from),
            (3600, 3600, 3_543_405)
        );
        // The configured markets plus one rolling market fit one MPC run.
        assert_eq!(c.markets.len() + 1, zpredict_circuit::DEFAULT_MARKETS);
        assert_eq!(c.frost_share_file, None, "until the key ceremony (#78)");
    }

    #[test]
    fn store_key_is_not_config_and_memo_key_is_optional() {
        let c = Config::parse(EXAMPLE, std::iter::empty()).unwrap();
        assert_eq!(c.memo_key_file, None);
        let env = [
            ("store_key".into(), "00".repeat(32)),
            ("memo_key_file".into(), "keys/r0-memo.pub".into()),
        ];
        let c = Config::parse(EXAMPLE, env.into_iter()).unwrap();
        assert_eq!(c.memo_key_file, Some("keys/r0-memo.pub".into()));
    }

    /// The mirrored markets in production are the binary markets their params name. Unlike
    /// the startup check, an unreachable Gamma fails here.
    #[test]
    #[ignore = "network"]
    fn production_mirrored_markets_check_against_gamma() {
        let prod = include_str!("../../../deploy/production/relayer.toml");
        let c = Config::parse(prod, std::iter::empty()).unwrap();
        let pm = zpredict_plugin_polymarket::Polymarket::default();
        let mirrored = crate::reference::mirrored(&c.markets).unwrap();
        for (id, p) in &mirrored {
            pm.market(p).unwrap_or_else(|e| panic!("market {id}: {e}"));
        }
        assert_eq!(mirrored.len(), 21);
    }

    #[test]
    fn judge_refused_on_mainnet() {
        let env = [("network".into(), "\"mainnet\"".into())];
        assert!(Config::parse(EXAMPLE, env.into_iter()).is_err());
    }
}
