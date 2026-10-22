//! zPredict's batch clearing as a 3-party MPC: a Garble circuit run with polytune.
//!
//! Each relayer holds one XOR share of every order in a batch of [`N`] = 16 slots. All
//! three call [`run_party`]; the circuit rebuilds the orders, crosses them exactly like
//! [`zpredict_core::clear`], and each relayer gets back only its XOR share of every
//! slot's fill record ([`zpredict_core::fill_records`], 10 bytes). Unfilled and dummy
//! slots are all-zero records, so a relayer cannot tell them from filled ones.
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
//! # Cost (N = 16)
//!
//! 311,528 AND gates. On one Apple-silicon laptop, three separate processes over
//! localhost TCP: ~8.5 s per batch for the MPC (`cargo run --release --example bench`),
//! plus ~6–11 s to compile the Garble program, once per process.
//!
//! # Trust
//!
//! polytune runs WRK17 authenticated garbling with distributed preprocessing (no trusted
//! dealer). An honest relayer's shares stay private even if the other two collude and
//! cheat; a cheater can only make the run abort. Not yet covered: balance checks (see
//! the PR), and authentication of the TCP links (see [`net`]).

mod error;
mod io;
pub mod net;
mod party;
mod program;

pub use error::Error;
pub use io::{FillShares, OrderShares};
pub use party::{run_party, run_party_on};
pub use program::{N, and_gates, eval_in_clear, program};
