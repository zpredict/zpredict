//! The deposit scanner: each relayer reads the escrow chain with the shared viewing key
//! and its own memo key, and records every confirmed, fixed-denomination deposit with a
//! readable memo slot (account id and this relayer's key share). Flagged notes (odd
//! amounts, no readable slot, anything in the withdraw-only Orchard pool) are never
//! credited. Orchard-pool notes are counted in the log so an operator can refund them
//! by hand (`packages/settle/README.md`); the line carries no txid, amount or account.
//!
//! A deposit is credited only once all three scanners have recorded it (the batch hello
//! intersects their offers), so no relayer can credit what the chain does not show.

use std::sync::Arc;
use std::time::Duration;

use zpredict_oracle::{Chain, Lightwalletd};
use zpredict_settle::{Flag, HALF_TICKS_PER_UNIT, Scanner};

use super::Escrow;
use crate::state::Shared;
use crate::store::Event;

const POLL: Duration = Duration::from_secs(20);
/// Blocks read per step, so progress is recorded as it goes on a long first scan.
const STEP: u32 = 500;

/// Scans forever on a blocking thread (the lightwalletd client is blocking).
pub fn poll(escrow: Arc<Escrow>, url: &str, state: Shared) {
    let node = match Lightwalletd::new(url) {
        Ok(n) => n,
        Err(e) => return eprintln!("escrow scan: {e}"),
    };
    let scanner = Scanner::new(&escrow.fvk, escrow.index, escrow.memo_key());
    loop {
        if let Err(e) = step(&escrow, &scanner, &node, &state) {
            eprintln!("escrow scan: {e}");
        }
        std::thread::sleep(POLL);
    }
}

/// Reads up to [`STEP`] confirmed blocks past the last scanned one.
fn step(
    escrow: &Escrow,
    scanner: &Scanner,
    node: &Lightwalletd,
    state: &Shared,
) -> crate::error::Result<()> {
    let tip = node
        .tip()
        .map_err(|e| crate::error::Error::Settle(e.to_string()))?;
    let confirmed = tip.saturating_sub(escrow.confirmations - 1);
    let scanned = state.lock().expect("state lock").ledger.scanned;
    let from = (scanned + 1).max(escrow.start_height);
    if from > confirmed {
        return Ok(());
    }
    let to = confirmed.min(from + STEP - 1);
    let found = scanner.blocks(node, from, to)?;
    let orchard = found
        .iter()
        .filter(|s| matches!(s, Err(f) if f.reason == Flag::Orchard))
        .count();
    if orchard > 0 {
        eprintln!(
            "escrow scan: {orchard} note(s) sent to the withdraw-only Orchard pool in blocks {from}..={to}, not credited; refund by hand (packages/settle/README.md)"
        );
    }
    let mut s = state.lock().expect("state lock");
    for d in found.into_iter().flatten() {
        let (id, share) = (d.account, hex::encode(d.key_share));
        s.record(Event::Key { id, share })?;
        s.record(Event::Deposit {
            note: format!("{}-{}", hex::encode(d.note.txid), d.note.action),
            account: d.account,
            amount: d.units * HALF_TICKS_PER_UNIT,
        })?;
    }
    s.record(Event::Scanned { height: to })
}
