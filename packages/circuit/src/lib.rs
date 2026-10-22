//! zPredict's batch clearing as a 3-party MPC: a Garble circuit run with polytune.
//!
//! One run clears one market. Each relayer holds one XOR share of every order in a
//! batch of [`N`] = 16 slots and of every row of the balance table (`id | balance`, any
//! number of rows; [`DEFAULT_ROWS`] = 32). All three call [`run_party`] with the same
//! public market id and per-row credits; the circuit rebuilds the orders and the table,
//! adds the credits, crosses the orders exactly like
//! [`zpredict_core::clear_with_balances`], and each relayer gets back only its XOR share
//! of every slot's fill record ([`zpredict_core::fill_records`], 10 bytes) and of every
//! row's new balance (8 bytes), plus the public clearing price. Unfilled and dummy
//! slots are all-zero records, so a relayer cannot tell them from filled ones.
//!
//! # Markets, credits, price
//!
//! Orders for another market are dummies, so a relayer runs one batch per open market.
//! Credits (deposits, judge credits: amounts every relayer already sees) are added to
//! their rows before clearing, so a top-up lands in the account's existing row. If the
//! parties disagree on market or credits, nothing clears and [`run_party_on`] returns
//! [`Error::Disagreement`]. The price is [`zpredict_core::clearing_price`]: the
//! volume-weighted YES cost of the batch's fills, revealed to all three; sizes and
//! counts stay hidden.
//!
//! # Balances
//!
//! The whole table goes in every batch, and each order finds its row inside the circuit
//! (first row whose id equals the order's `account`). Relayers never learn which
//! accounts traded: they only hold shares of orders, so they could not pick per-batch
//! rows without that link leaking. In batch order, each order reserves its worst case
//! (`size × 2 × price` half-ticks) from its row; one that doesn't fit what's left, or
//! has no row, becomes a dummy. Rows are then debited what their orders actually paid.
//!
//! # How the circuit matches `clear` without sorting
//!
//! `clear` sorts each side best price first (ties by index) and walks the two queues,
//! filling `min(left)` per step until a pair stops crossing. Lay each side's sorted
//! sizes end to end: order `i` owns the interval `[start_i, start_i + size_i)`, where
//! `start_i` is the total size of same-side orders ahead of it. The walk visits exactly
//! the YES/NO pairs whose intervals overlap, in order, and fills each by the overlap
//! length. Along that walk both prices only fall, so once a pair fails `p + q >= 100`
//! every later pair fails too. Hence, with no sort and no data-dependent control flow:
//!
//! `fill(y, n) = overlap(y, n)` if `p_y + q_n >= 100`, else `0`
//!
//! The circuit computes every `start_i` with N×N comparisons and every pair's fill with
//! N(N-1)/2 passes, then sums fills and costs (half-ticks, `p + 100 - q` for YES and
//! `200` minus that for NO) per slot. Size-0 dummies have empty intervals and never fill.
//! Slots that fail `Order::decode` (bad side, price outside 1..=99, size > `MAX_SIZE`)
//! are dummies. `MAX_SIZE` keeps all sums inside `u32`.
//!
//! # Cost (N = 16, one market)
//!
//! Three separate processes over localhost TCP on an M4 Pro, release
//! (`cargo run --release --example bench <runs> <rows>`):
//!
//! | rows | AND gates | MPC per batch | compile (once per size and process) |
//! |------|-----------|---------------|-------------------------------------|
//! | 16   | 467,104   | 11.5–12.5 s   | 16 s                                |
//! | 32   | 598,872   | 14.6–16.1 s   | 25 s                                |
//! | 64   | 862,408   | 22.4–25.1 s   | 49 s                                |
//!
//! Each row costs ~8k AND gates. Traffic scales with AND gates (crossing alone sent
//! 0.5–0.6 GB per party), so between hosts bandwidth will likely dominate, and a window
//! with several open markets costs one run per market.
//!
//! # Trust
//!
//! polytune runs WRK17 authenticated garbling with distributed preprocessing (no trusted
//! dealer). An honest relayer's shares stay private even if the other two collude and
//! cheat; a cheater can only make the run abort. Not yet covered: authentication of the
//! TCP links (see [`net`]).

mod error;
pub mod harness;
mod io;
pub mod net;
mod party;
mod program;

pub use error::Error;
pub use io::{OrderShares, Outcome};
pub use party::{run_party, run_party_on};
pub use program::{DEFAULT_ROWS, N, and_gates, eval_in_clear, program};
