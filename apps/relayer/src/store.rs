//! Durable state: an append-only JSON-lines event log, `events.jsonl` in the data dir.
//!
//! Every state change is first appended and fsynced, then applied in memory; at startup
//! the log is replayed through the same `apply`, so a restart loses nothing that was
//! acknowledged. A torn last line (crash mid-write) is dropped. The log holds only this
//! relayer's own shares, which are random-looking on their own; the dir is mode 0700.
//!
//! ponytail: the log is never compacted; fine for a hackathon's volume, snapshot + truncate
//! when it grows.

use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::DirBuilderExt;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::ledger::WithdrawalStatus;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Event {
    /// This relayer's share of an order arrived during `batch`.
    Order {
        id: String,
        share: String,
        batch: u64,
        /// The browser's read token for this relayer's fill share (#15). Orders logged
        /// before it existed have none and can no longer be read.
        #[serde(default)]
        token: String,
    },
    /// A batch ran: `ids[k]` got fill share `fills[k]`; balance-table row `k` got new
    /// balance share `balances[k]`; `prices` are public clearing prices
    /// `(market, YES half-ticks)`; `expired` orders became `unfilled`.
    Batch {
        batch: u64,
        ids: Vec<String>,
        fills: Vec<String>,
        balances: Vec<String>,
        prices: Vec<(u32, u16)>,
        expired: Vec<String>,
        /// Public credits the batch added to each row (relayer 0 clears them as pending).
        #[serde(default)]
        credits: Vec<u64>,
        /// Deposits (as offered, `note:account:amount`) those credits included.
        #[serde(default)]
        deposits: Vec<String>,
        /// Withdrawal ids that took a slot, and whether each went through.
        #[serde(default)]
        withdrawals: Vec<(String, bool)>,
    },
    /// This relayer's scanner found a confirmed deposit of `amount` half-ticks for
    /// `account` in escrow note `note` (`<txid>-<action>`). A `Key` event for its memo
    /// slot's key share comes first.
    Deposit {
        note: String,
        account: u64,
        amount: u64,
    },
    /// The scanner has read the escrow chain up to `height`.
    Scanned { height: u32 },
    /// A withdrawal request: this relayer's share of the account key, the amount in
    /// half-ticks and the shielded address to pay.
    Withdrawal {
        id: String,
        share: String,
        amount: u64,
        address: String,
    },
    /// `market`'s winners were paid into the table: rows got new balance shares.
    Resolved { market: u32, balances: Vec<String> },
    /// Debited withdrawals `ids` moved to `status` (paying or paid, with the txid).
    Payout {
        ids: Vec<String>,
        status: WithdrawalStatus,
        txid: Option<String>,
    },
    /// Relayer 0: account `id` was credited `amount` half-ticks (see `table.rs`).
    Credit { id: u64, amount: u64 },
    /// This relayer's share (hex32) of account `id`'s key, from a deposit memo or a judge
    /// claim (see `table.rs`: a different second share burns the key).
    Key { id: u64, share: String },
    /// Relayers 1 and 2: zero-share rows appended for ids relayer 0 announced.
    Rows { ids: Vec<u64> },
    /// Relayer 0: the first `rows` table rows entered a batch; credit them via new rows.
    Seal { rows: usize },
}

pub struct Store(File);

impl Store {
    /// Opens (creating) the log in `dir` and returns it with every event so far.
    pub fn open(dir: &Path) -> Result<(Self, Vec<Event>)> {
        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(dir)?;
        let path = dir.join("events.jsonl");
        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .append(true)
            .open(&path)?;
        let lines: Vec<String> = BufReader::new(&file)
            .lines()
            .collect::<std::io::Result<_>>()?;
        let mut events = Vec::with_capacity(lines.len());
        for (n, line) in lines.iter().enumerate() {
            match serde_json::from_str(line) {
                Ok(e) => events.push(e),
                Err(_) if n + 1 == lines.len() => {
                    // Torn write: rewrite the log without it so appends start on a clean line.
                    let mut tmp = File::create(dir.join("events.jsonl.tmp"))?;
                    for l in &lines[..n] {
                        writeln!(tmp, "{l}")?;
                    }
                    tmp.sync_all()?;
                    std::fs::rename(dir.join("events.jsonl.tmp"), &path)?;
                    return Ok((Self(OpenOptions::new().append(true).open(&path)?), events));
                }
                Err(e) => return Err(Error::Store(format!("line {}: {e}", n + 1))),
            }
        }
        Ok((Self(file), events))
    }

    pub fn append(&mut self, e: &Event) -> Result<()> {
        let mut line = serde_json::to_string(e).expect("events serialize");
        line.push('\n');
        self.0.write_all(line.as_bytes())?;
        self.0.sync_data()?;
        Ok(())
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub fn temp_dir(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("zpredict-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn replays_and_drops_torn_tail() {
        let dir = temp_dir("store");
        let e = Event::Credit { id: 7, amount: 5 };
        let (mut s, got) = Store::open(&dir).unwrap();
        assert!(got.is_empty());
        s.append(&e).unwrap();
        drop(s);
        let mut f = OpenOptions::new()
            .append(true)
            .open(dir.join("events.jsonl"))
            .unwrap();
        f.write_all(b"{\"kind\":\"cre").unwrap();
        let (mut s, got) = Store::open(&dir).unwrap();
        assert_eq!(got, vec![e.clone()]);
        s.append(&e).unwrap();
        assert_eq!(Store::open(&dir).unwrap().1, vec![e.clone(), e]);
    }
}
