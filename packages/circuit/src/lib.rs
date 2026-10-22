//! zPredict's batch clearing as a 3-party MPC: a Garble circuit run with polytune.
//!
//! One run clears several markets at once. Each relayer holds one XOR share of every
//! order in a batch ([`DEFAULT_SLOTS`] = 8 slots, up to [`MAX_SLOTS`]) and of every row of
//! the balance table (`id | balance`, any number of rows; [`DEFAULT_ROWS`] = 32). All
//! three call [`run_party`] with the same public market list ([`DEFAULT_MARKETS`] = 4
//! slots, `0` = unused) and per-row credits; the circuit rebuilds the orders and the
//! table, adds the credits, crosses the orders exactly like
//! [`zpredict_core::clear_with_balances`], and each relayer gets back only its XOR share
//! of every slot's fill record ([`zpredict_core::fill_records`], 10 bytes) and of every
//! row's new balance (8 bytes), plus one public clearing price per market. Unfilled and
//! dummy slots are all-zero records, so a relayer cannot tell them from filled ones.
//!
//! # Markets, credits, withdrawals, prices
//!
//! The public inputs are a [`Public`]. Orders only cross within their own market
//! (same-market queues and pairs), and orders for a market not in the list are dummies.
//! The list is every open market, so the same circuit runs whichever markets have
//! orders. Credits (deposits, judge credits: amounts every relayer already sees) are
//! added to their rows before clearing, so a top-up lands in the account's existing
//! row. Then each withdrawal (a public amount; whose it is stays secret-shared, like an
//! order's key) is taken only if the row with its key covers it, before any order
//! reserves funds, and the public `withdrawn` output says which went through: relayers
//! need the amount to pay it out, and never learn whose withdrawal it was, so they
//! cannot link a deposit to a payout. If the parties disagree on any public input,
//! nothing moves and [`run_party_on`] returns [`Error::Disagreement`]. Each market's price is [`zpredict_core::clearing_price`]: the
//! volume-weighted YES cost of its fills, revealed to all three; sizes and counts stay
//! hidden.
//!
//! # Balances
//!
//! The whole table goes in every batch, and each order finds its row inside the circuit
//! (first row whose key equals the order's `key`). A row's key is the account's
//! credential: every relayer holds a share of it and requests carry it as fresh shares,
//! so no single relayer can spend a row (the row id is only a public label). A wrong key
//! finds no row. Relayers never learn which accounts traded: they only hold shares of orders, so they could not pick per-batch
//! rows without that link leaking. In batch order, each order reserves its worst case
//! (`size × 2 × price` half-ticks) from its row; one that doesn't fit what's left, or
//! has no row, becomes a dummy. Rows are then debited what their orders actually paid.
//!
//! # Resolution payouts
//!
//! A second, small program ([`resolve`]) runs when a market resolves: over every
//! position (an order share and its fill share; no relayer knows whose, in which market
//! or whether it filled), it pays one unit per winning contract into the account's row,
//! as shares. Reference: [`zpredict_core::resolve`].
//!
//! # How the circuit matches `clear` without sorting
//!
//! `clear` sorts each side best price first (ties by index) and walks the two queues,
//! filling `min(left)` per step until a pair stops crossing. Lay each side's sorted
//! sizes end to end: order `i` owns the interval `[start_i, start_i + size_i)`, where
//! `start_i` is the total size of same-market, same-side orders ahead of it. The walk visits exactly
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
//! # Cost (4 market slots)
//!
//! Three separate processes over localhost TCP on an M4 Pro, release
//! (`cargo run --release --example bench <runs> <rows> <slots>`); peak RSS per party
//! includes compiling:
//!
//! | slots | rows | AND gates | MPC per batch | compile | peak RSS     |
//! |-------|------|-----------|---------------|---------|--------------|
//! | 8     | 16   | 167,949   | 3.6 s         | 2.5 s   | 0.36 GB      |
//! | 8     | 32   | 290,543   | 6.3 s         | 6.8 s   | 0.63 GB      |
//! | 16    | 16   | 490,829   | 10.5 s        | 14 s    | 0.7–1.0 GB   |
//! | 16    | 32   | 622,597   | 13.5 s        | 21 s    | 1.0–1.4 GB   |
//!
//! Crossing costs ~N² AND gates and each table row ~8k; four market slots cost ~24k
//! together, so one run replaces one run per market. Each party uses about one core.
//! Traffic scales with AND gates (16 slots, one market sent 0.5–0.6 GB per party).
//! The other rows predate withdrawals and row keys; 8 × 32 includes
//! [`DEFAULT_WITHDRAWALS`] = 2 withdrawal slots (~9k gates each) and 128-bit row keys
//! (+21k gates, +0.4 s over id matching).
//! A resolution run of [`DEFAULT_POSITIONS`] = 16 positions over 32 rows is 158,335 AND
//! gates (~3.5 s by the same rate).
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
pub mod resolve;

pub use error::Error;
pub use io::{Outcome, Public, Shares};
pub use party::{run_party, run_party_on};
pub use program::{
    DEFAULT_MARKETS, DEFAULT_ROWS, DEFAULT_SLOTS, DEFAULT_WITHDRAWALS, MAX_SLOTS, and_gates,
    eval_in_clear, program, resolve_program,
};
pub use resolve::{DEFAULT_POSITIONS, Position, resolve_in_clear, run_resolution_on};
