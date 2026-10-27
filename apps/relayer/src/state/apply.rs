//! Applying logged events to the in-memory state: the only place state changes.

use zpredict_core::{BALANCE_LEN, FILL_LEN, ORDER_LEN};

use super::{HISTORY_KEEP, Order, State, Status, VIEW_KEEP, ViewItem, hex_array, view_digest};
use crate::ledger::WithdrawalStatus;
use crate::store::Event;

impl State {
    pub(super) fn apply(&mut self, e: Event) {
        match e {
            Event::Order {
                id,
                share,
                batch,
                token,
            } => {
                let mut b = [0u8; ORDER_LEN];
                hex::decode_to_slice(&share, &mut b).expect("logged shares are valid hex");
                self.see("order", &b);
                let status = Status::Pending { born: batch };
                let order = Order {
                    share: b,
                    status,
                    token,
                };
                self.orders.insert(id, order);
                self.batch = self.batch.max(batch);
            }
            Event::Batch {
                batch,
                ids,
                fills,
                balances,
                prices,
                expired,
                credits,
                deposits,
                withdrawals,
                at,
            } => {
                self.table.applied(&credits);
                self.ledger.apply_deposits(&deposits);
                for (id, ok) in withdrawals {
                    let status = if ok {
                        WithdrawalStatus::Debited
                    } else {
                        WithdrawalStatus::Refused
                    };
                    self.ledger.set(&id, status, None);
                }
                let balances: Vec<[u8; BALANCE_LEN]> =
                    (balances.iter()).map(|b| hex_array(b)).collect();
                self.table.set_balances(&balances);
                for (id, fill) in ids.into_iter().zip(fills) {
                    let mut f = [0u8; FILL_LEN];
                    hex::decode_to_slice(&fill, &mut f).expect("logged fills are valid hex");
                    self.see("fill", &f);
                    if let Some(o) = self.orders.get_mut(&id) {
                        o.status = Status::Filled(f);
                    }
                }
                for (market, half_ticks) in prices {
                    let h = self.history.entry(market).or_default();
                    h.push((f64::from(half_ticks) / 2.0, at));
                    if h.len() > HISTORY_KEEP {
                        h.remove(0);
                    }
                }
                for id in expired {
                    if let Some(o) = self.orders.get_mut(&id) {
                        o.status = Status::Unfilled;
                    }
                }
                self.batch = self.batch.max(batch + 1);
                // An MPC run rewrote the balances at all three; an expiry-only batch (no
                // balances) is local and may differ, e.g. for a share one relayer never got.
                if !balances.is_empty() {
                    self.commits += 1;
                }
            }
            // Only judge claims record credits (deposits go through the circuit), so a
            // credited id is a judge account, also in logs from before `Mock` existed.
            Event::Credit { id, amount } => {
                self.table.mark_mock(id);
                self.table.credit(id, amount);
            }
            Event::Mock { id } => self.table.mark_mock(id),
            Event::Key { id, share } => {
                self.table.register(id, hex_array(&share));
            }
            Event::Deposit {
                note,
                account,
                amount,
            } => {
                // Relayer 0 opens a row for a new account; the circuit credits it.
                if self.index == 0 && !self.table.ids().contains(&account) {
                    self.table.credit(account, 0);
                }
                self.ledger.deposit(note, account, amount);
            }
            Event::Scanned { height } => self.ledger.scanned = self.ledger.scanned.max(height),
            Event::Withdrawal {
                id,
                share,
                amount,
                address,
            } => {
                let share = hex_array(&share);
                self.ledger.request(id, share, amount, address);
            }
            Event::Resolved { market, balances } => {
                let balances: Vec<[u8; BALANCE_LEN]> =
                    (balances.iter()).map(|b| hex_array(b)).collect();
                self.table.set_balances(&balances);
                self.ledger.resolved.insert(market);
                self.commits += 1;
            }
            Event::Payout { ids, status, txid } => {
                for id in ids {
                    self.ledger.set(&id, status, txid.as_deref());
                }
            }
            Event::Rows { ids } => self.table.append_zero(&ids),
            Event::Seal { rows } => self.table.seal(rows),
        }
    }

    fn see(&mut self, kind: &'static str, share: &[u8]) {
        self.seq += 1;
        let seq = self.seq;
        let digest = view_digest(share);
        self.view.push_back(ViewItem { seq, kind, digest });
        if self.view.len() > VIEW_KEEP {
            self.view.pop_front();
        }
    }
}
