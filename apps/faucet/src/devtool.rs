//! zcash-devtool over the faucet's own wallet (pinned rev, as `scripts/lib/env.sh`).
//! `pay` builds a ZIP 317-fee transfer that never spends transparent funds; every call
//! blocks, so run them on a blocking thread, one at a time (one sqlite wallet).

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;

use serde::Deserialize;

pub struct Devtool {
    pub bin: PathBuf,
    pub wallet: PathBuf,
    /// age identity the wallet's mnemonic is encrypted to (needed to sign).
    pub identity: PathBuf,
    /// lightwalletd as devtool's `-s` takes it, e.g. `zecrocks` or `127.0.0.1:9067`.
    pub server: String,
}

pub type Result<T> = std::result::Result<T, String>;

impl Devtool {
    fn run(&self, args: &[&str]) -> Result<String> {
        let wallet = self.wallet.to_string_lossy();
        let out = Command::new(&self.bin)
            .args(["wallet", "-w", &wallet])
            .args(args)
            .env("RUST_LOG", "warn")
            .output()
            .map_err(|e| format!("zcash-devtool: {e}"))?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            let last = err.lines().last().unwrap_or("no output");
            return Err(format!("zcash-devtool {}: {last}", args[0]));
        }
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    }

    pub fn sync(&self) -> Result<()> {
        self.run(&["sync", "-s", &self.server]).map(drop)
    }

    /// Spendable shielded zats (transparent is never spent, so never counted).
    pub fn spendable(&self) -> Result<u64> {
        #[derive(Deserialize)]
        struct B {
            sapling_spendable: u64,
            orchard_spendable: u64,
            ironwood_spendable: u64,
        }
        let b: B = serde_json::from_str(self.run(&["balance", "--json"])?.trim())
            .map_err(|e| format!("balance: {e}"))?;
        Ok(b.sapling_spendable + b.orchard_spendable + b.ironwood_spendable)
    }

    /// Mined height (or `None`) of every transaction the wallet knows.
    pub fn mined(&self) -> Result<HashMap<String, Option<u32>>> {
        #[derive(Deserialize)]
        struct T {
            txid: String,
            mined_height: Option<u32>,
        }
        let txs: Vec<T> = serde_json::from_str(self.run(&["list-tx", "--json"])?.trim())
            .map_err(|e| format!("list-tx: {e}"))?;
        Ok(txs.into_iter().map(|t| (t.txid, t.mined_height)).collect())
    }

    /// Pays a ZIP 321 request and returns the txid (devtool's last output line).
    pub fn pay(&self, uri: &str) -> Result<String> {
        let id = self.identity.to_string_lossy();
        let out = self.run(&[
            "pay",
            "-i",
            &id,
            "--payment-uri",
            uri,
            "--disable-confirmation",
            "-s",
            &self.server,
        ])?;
        let last = out.lines().last().unwrap_or_default().trim();
        if last.len() == 64 && last.bytes().all(|b| b.is_ascii_hexdigit()) {
            Ok(last.to_owned())
        } else {
            Err("zcash-devtool pay printed no txid".into())
        }
    }
}
