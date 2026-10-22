//! In-memory relayer state, rebuilt from the event log at startup (`store.rs`).
//! Every mutation goes through [`State::record`]: append + fsync, then apply.

use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use zpredict_core::{BALANCE_LEN, FILL_LEN, ORDER_LEN};
use zpredict_oracle::Market;

use crate::error::Result;
use crate::store::{Event, Store};
use crate::table::Table;

/// View items kept for `GET /view`.
pub const VIEW_KEEP: usize = 400;
/// Clearing prices kept per market for `Market.history`.
pub const HISTORY_KEEP: usize = 64;
/// Pending orders accepted before `POST /orders` answers 503.
pub const MAX_PENDING: usize = 10_000;

pub type Shared = Arc<Mutex<State>>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Pending {
        born: u64,
    },
    /// Every batched order gets a fill share, filled or not: the relayer can't tell.
    Filled([u8; FILL_LEN]),
    /// Expired before all three relayers held a share.
    Unfilled,
}

pub struct Order {
    pub share: [u8; ORDER_LEN],
    pub status: Status,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewItem {
    pub seq: u64,
    pub kind: &'static str,
    pub order_id: String,
    pub share: String,
}

pub enum Accept {
    Joined(u64),
    Duplicate,
    Full,
}

pub struct State {
    pub index: usize,
    /// The next batch number; synced to the max across peers each batch.
    pub batch: u64,
    pub height: u32,
    /// Whether the last batch attempt reached each party (own slot always true).
    pub peers: [bool; 3],
    pub markets: Vec<Market>,
    orders: HashMap<String, Order>,
    /// This relayer's shares of the balance table (`table.rs`).
    pub table: Table,
    /// Market id → public clearing prices in cents (YES side), oldest first.
    history: HashMap<u32, Vec<f64>>,
    view: VecDeque<ViewItem>,
    seq: u64,
    store: Store,
}

impl State {
    pub fn open(index: usize, markets: Vec<Market>, dir: &Path) -> Result<Self> {
        let (store, events) = Store::open(dir)?;
        let mut peers = [false; 3];
        peers[index] = true;
        let mut s = Self {
            index,
            batch: 1,
            height: 0,
            peers,
            markets,
            orders: HashMap::new(),
            table: Table::default(),
            history: HashMap::new(),
            view: VecDeque::new(),
            seq: 0,
            store,
        };
        events.into_iter().for_each(|e| s.apply(e));
        Ok(s)
    }

    pub fn shared(self) -> Shared {
        Arc::new(Mutex::new(self))
    }

    pub fn record(&mut self, e: Event) -> Result<()> {
        self.store.append(&e)?;
        self.apply(e);
        Ok(())
    }

    fn apply(&mut self, e: Event) {
        match e {
            Event::Order { id, share, batch } => {
                let mut b = [0u8; ORDER_LEN];
                hex::decode_to_slice(&share, &mut b).expect("logged shares are valid hex");
                self.see("order", &id, share);
                let status = Status::Pending { born: batch };
                self.orders.insert(id, Order { share: b, status });
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
            } => {
                self.table.applied(&credits);
                let balances: Vec<[u8; BALANCE_LEN]> =
                    (balances.iter()).map(|b| hex_array(b)).collect();
                self.table.set_balances(&balances);
                for (id, fill) in ids.into_iter().zip(fills) {
                    let mut f = [0u8; FILL_LEN];
                    hex::decode_to_slice(&fill, &mut f).expect("logged fills are valid hex");
                    self.see("fill", &id, fill);
                    if let Some(o) = self.orders.get_mut(&id) {
                        o.status = Status::Filled(f);
                    }
                }
                for (market, half_ticks) in prices {
                    let h = self.history.entry(market).or_default();
                    h.push(f64::from(half_ticks) / 2.0);
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
            }
            Event::Credit { id, amount } => self.table.credit(id, amount),
            Event::Rows { ids } => self.table.append_zero(&ids),
            Event::Seal { rows } => self.table.seal(rows),
        }
    }

    fn see(&mut self, kind: &'static str, id: &str, share: String) {
        self.seq += 1;
        let order_id = id.to_owned();
        let seq = self.seq;
        self.view.push_back(ViewItem {
            seq,
            kind,
            order_id,
            share,
        });
        if self.view.len() > VIEW_KEEP {
            self.view.pop_front();
        }
    }

    /// Stores this relayer's share of an order: one share per order, ever.
    pub fn accept(&mut self, id: &str, share: [u8; ORDER_LEN]) -> Result<Accept> {
        if self.orders.contains_key(id) {
            return Ok(Accept::Duplicate);
        }
        if self.pending().len() >= MAX_PENDING {
            return Ok(Accept::Full);
        }
        let batch = self.batch;
        let (id, share) = (id.to_owned(), hex::encode(share));
        self.record(Event::Order { id, share, batch })?;
        Ok(Accept::Joined(batch))
    }

    pub fn order(&self, id: &str) -> Option<&Order> {
        self.orders.get(id)
    }

    /// Pending order ids, sorted (the order every relayer uses to fill batch slots).
    pub fn pending(&self) -> Vec<String> {
        let mut ids: Vec<String> = (self.orders.iter())
            .filter(|(_, o)| matches!(o.status, Status::Pending { .. }))
            .map(|(id, _)| id.clone())
            .collect();
        ids.sort();
        ids
    }

    /// Pending orders outside `keep` that are `expire` batches old by `batch`.
    pub fn expirable(&self, batch: u64, expire: u64, keep: &[String]) -> Vec<String> {
        let mut ids: Vec<String> = (self.orders.iter())
            .filter(|(id, o)| match o.status {
                Status::Pending { born } => {
                    batch.saturating_sub(born) >= expire && !keep.contains(id)
                }
                _ => false,
            })
            .map(|(id, _)| id.clone())
            .collect();
        ids.sort();
        ids
    }

    /// This relayer's balance share for an account tag (hex32; its first 8 bytes are
    /// the account id, as in `Order::account`).
    pub fn balance_share(&self, tag: &str) -> [u8; BALANCE_LEN] {
        self.table.balance_share(tag_account(tag))
    }

    /// Deposit entry point (settle scanner, judge mode). Every relayer sees the amount
    /// anyway (shared viewing key), so relayer 0 credits it (`table.rs`): into a fresh
    /// row's `(A, 0, 0)` share, or as a public credit the next batch's circuit adds.
    /// Relayers 1 and 2 learn both from relayer 0 at the next batch; here a no-op.
    pub fn credit(&mut self, tag: &str, amount: u64) -> Result<()> {
        if self.index != 0 {
            return Ok(());
        }
        let id = tag_account(tag);
        self.record(Event::Credit { id, amount })
    }

    pub fn view_after(&self, after: u64, max: usize) -> Vec<ViewItem> {
        let items = self.view.iter().filter(|v| v.seq > after);
        items.take(max).cloned().collect()
    }

    pub fn history(&self, market: u32) -> &[f64] {
        self.history.get(&market).map_or(&[], Vec::as_slice)
    }

    /// Settlement hook: this relayer's fill share of every batched order. The payout MPC
    /// combines these with the other two relayers' (see `settlement::payout`).
    pub fn positions(&self) -> Vec<(String, [u8; FILL_LEN])> {
        let mut out: Vec<_> = (self.orders.iter())
            .filter_map(|(id, o)| match o.status {
                Status::Filled(f) => Some((id.clone(), f)),
                _ => None,
            })
            .collect();
        out.sort();
        out
    }
}

/// The order's `account` field for a tag: its first 8 bytes, little-endian.
pub fn tag_account(tag: &str) -> u64 {
    let mut b = [0u8; 8];
    hex::decode_to_slice(&tag[..16], &mut b).expect("tags are checked hex32");
    u64::from_le_bytes(b)
}

pub(crate) fn hex_array<const L: usize>(h: &str) -> [u8; L] {
    let mut b = [0u8; L];
    hex::decode_to_slice(h, &mut b).expect("logged shares are valid hex");
    b
}
