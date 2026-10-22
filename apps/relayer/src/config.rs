//! Relayer settings: a TOML file, with any top-level scalar overridable by an env var
//! `ZPREDICT_<KEY>` (e.g. `ZPREDICT_WEB_ORIGIN`, `ZPREDICT_JUDGE=false`).

use std::net::SocketAddr;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use zpredict_oracle::Market;

use crate::error::{Error, Result};

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
    /// lightwalletd gRPC endpoint for heights and market resolution; the only third party
    /// the relayer ever contacts. Unset = height stays 0 and markets stay as configured.
    #[serde(default)]
    pub lightwalletd: Option<String>,
    /// Slots per MPC batch (N); must equal `zpredict_circuit::N` for the real matcher.
    pub batch_size: usize,
    pub window_secs: u64,
    /// A pending order not in any batch for this many batches becomes `unfilled`.
    pub expire_batches: u64,
    /// `POST /judge/claim` (mock credit); refused on mainnet.
    #[serde(default)]
    pub judge: bool,
    /// Judge credit in half-ticks.
    #[serde(default)]
    pub judge_credit: u64,
    /// Event log directory (see `store.rs`).
    pub data_dir: PathBuf,
    /// Use the plaintext dev matcher (needs the `dev-insecure` feature too).
    #[serde(default)]
    pub insecure_matcher: bool,
    pub markets: Vec<Market>,
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
        {
            *p = base.join(&*p);
        }
        Ok(c)
    }

    pub fn parse(text: &str, env: impl Iterator<Item = (String, String)>) -> Result<Self> {
        let mut table: toml::Table =
            toml::from_str(text).map_err(|e| Error::Config(e.to_string()))?;
        for (key, raw) in env {
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
        Ok(())
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub const EXAMPLE: &str = include_str!("../config/r0.toml");

    #[test]
    fn example_parses_and_env_overrides() {
        let c = Config::parse(EXAMPLE, std::iter::empty()).unwrap();
        assert_eq!((c.index, c.batch_size), (0, 16));
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
    fn judge_refused_on_mainnet() {
        let env = [("network".into(), "\"mainnet\"".into())];
        assert!(Config::parse(EXAMPLE, env.into_iter()).is_err());
    }
}
