//! zcash-devtool over the escrow wallet, as the settle scripts use it (pinned rev in
//! `scripts/lib/env.sh`): sync, prove, combine and broadcast a payout PCZT. Relayer 0
//! only. Every call blocks; run them on a blocking thread.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use crate::error::{Error, Result};

#[derive(Clone)]
pub struct Devtool {
    pub bin: PathBuf,
    /// The escrow's zcash-devtool wallet directory (watch-only UFVK, notes, witnesses).
    pub wallet: PathBuf,
    /// lightwalletd as devtool's `-s` takes it, e.g. `127.0.0.1:9067` or `zecrocks`.
    pub server: String,
}

impl Devtool {
    fn run(&self, args: &[&str], stdin: Option<&[u8]>) -> Result<Vec<u8>> {
        let mut child = Command::new(&self.bin)
            .args(args)
            .env("RUST_LOG", "warn")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        let mut input = child.stdin.take().expect("piped stdin");
        input.write_all(stdin.unwrap_or_default())?;
        drop(input);
        let out = child.wait_with_output()?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            let last = err.lines().last().unwrap_or("no output");
            return Err(Error::Settle(format!("zcash-devtool {}: {last}", args[0])));
        }
        Ok(out.stdout)
    }

    fn wallet(&self) -> &str {
        self.wallet.to_str().unwrap_or_default()
    }

    pub fn sync(&self) -> Result<()> {
        self.run(
            &["wallet", "-w", self.wallet(), "sync", "-s", &self.server],
            None,
        )?;
        Ok(())
    }

    pub fn prove(&self, pczt: &[u8]) -> Result<Vec<u8>> {
        self.run(&["pczt", "-w", self.wallet(), "prove"], Some(pczt))
    }

    /// Merges the signed and the proven PCZT. devtool reads both from files, written
    /// next to the wallet (operator-controlled, tmpfs in the scripts) and removed after.
    pub fn combine(&self, signed: &[u8], proven: &[u8]) -> Result<Vec<u8>> {
        let dir = self.wallet.parent().unwrap_or(&self.wallet);
        let (a, b) = (
            dir.join("payout-signed.pczt"),
            dir.join("payout-proven.pczt"),
        );
        std::fs::write(&a, signed)?;
        std::fs::write(&b, proven)?;
        let (sa, sb) = (a.to_string_lossy(), b.to_string_lossy());
        let out = self.run(&["pczt", "combine", "-i", &sa, "-i", &sb], None);
        let _ = (std::fs::remove_file(&a), std::fs::remove_file(&b));
        out
    }

    /// Broadcasts and returns the txid.
    pub fn send(&self, pczt: &[u8]) -> Result<String> {
        let out = self.run(
            &["pczt", "-w", self.wallet(), "send", "-s", &self.server],
            Some(pczt),
        )?;
        let text = String::from_utf8_lossy(&out);
        let is_txid = |w: &&str| w.len() == 64 && w.bytes().all(|b| b.is_ascii_hexdigit());
        (text.split(|c: char| !c.is_ascii_alphanumeric()))
            .filter(is_txid)
            .next_back()
            .map(str::to_owned)
            .ok_or_else(|| Error::Settle("zcash-devtool send printed no txid".into()))
    }
}
