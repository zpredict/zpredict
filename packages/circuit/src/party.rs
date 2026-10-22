use std::net::SocketAddr;

use polytune::channel::Channel;
use zpredict_core::{ACCOUNT_LEN, ORDER_LEN};

use crate::{
    Error,
    io::{self, Outcome},
    net::TcpChannel,
    program::{circuit, program},
};

/// The garbled-circuit evaluator.
const EVALUATOR: usize = 0;
/// Everyone receives the output: shares stay masked, and the prices are public anyway.
const ALL: [usize; 3] = [0, 1, 2];

/// Runs one relayer's side of a batch over TCP. `peers` lists all three parties'
/// addresses in party order; this party listens on `peers[party]`.
pub async fn run_party(
    party: usize,
    peers: &[SocketAddr; 3],
    markets: &[u32],
    credits: &[u64],
    orders: &[[u8; ORDER_LEN]],
    accounts: &[[u8; ACCOUNT_LEN]],
) -> Result<Outcome, Error> {
    let channel = TcpChannel::connect(party, peers).await?;
    run_party_on(&channel, party, markets, credits, orders, accounts).await
}

/// Same as [`run_party`] over any polytune channel (e.g. one carried over HTTPS).
///
/// - `markets`: the markets this run clears, public, the same list at all three; `0`
///   pads unused slots, and its length picks the program (keep it fixed, e.g.
///   [`DEFAULT_MARKETS`](crate::DEFAULT_MARKETS), so the shape never changes). Orders
///   only cross within their own market.
/// - `credits`: half-ticks to add to each table row before clearing (deposits, judge
///   credits), public; one per row, the same at all three.
/// - `orders`: this relayer's share of each order slot, padded with zero shares; its
///   length (2..=[`MAX_SLOTS`](crate::MAX_SLOTS), e.g.
///   [`DEFAULT_SLOTS`](crate::DEFAULT_SLOTS)) picks the program.
/// - `accounts`: this relayer's share of every balance-table row (`Account::encode`),
///   in the same order at all three; its length picks the table size.
///
/// Returns [`Error::Disagreement`] if the parties' markets or credits differ: then
/// nothing was cleared or credited.
///
/// Each party feeds a fresh random mask `m_p` into the circuit, which reveals
/// `shares ^ m_0 ^ m_1 ^ m_2` and the prices to all three. Party 0's share is that output
/// `^ m_0`; party 1 and 2's shares are their own masks, so no party (nor any two) can
/// unmask a record, and the three shares XOR to `zpredict_core::clear_with_balances`.
pub async fn run_party_on(
    channel: &impl Channel,
    party: usize,
    markets: &[u32],
    credits: &[u64],
    orders: &[[u8; ORDER_LEN]],
    accounts: &[[u8; ACCOUNT_LEN]],
) -> Result<Outcome, Error> {
    if !(2..=crate::MAX_SLOTS).contains(&orders.len()) || credits.len() != accounts.len() {
        return Err(Error::Circuit(
            "need 2..=21 order slots and one credit per table row".into(),
        ));
    }
    let prg = program(orders.len(), accounts.len(), markets.len());
    let mask = Outcome::random(orders.len(), accounts.len());
    let input = io::input_bits(prg, party, markets, credits, orders, accounts, &mask)?;
    let out = polytune::mpc(channel, circuit(prg), &input, EVALUATOR, party, &ALL, None).await?;
    let out = io::decode_output(prg, &out)?;
    if party == EVALUATOR {
        return Ok(out.xor(&mask));
    }
    Ok(Outcome {
        prices: out.prices,
        ..mask
    })
}
