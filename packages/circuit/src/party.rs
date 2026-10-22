use std::net::SocketAddr;

use polytune::channel::Channel;
use zpredict_core::{ACCOUNT_LEN, ORDER_LEN};

use crate::{
    Error, N,
    io::{self, Outcome},
    net::TcpChannel,
    program::{circuit, program},
};

/// The garbled-circuit evaluator.
const EVALUATOR: usize = 0;
/// Everyone receives the output: shares stay masked, and the price is public anyway.
const ALL: [usize; 3] = [0, 1, 2];

/// Runs one relayer's side of a batch over TCP. `peers` lists all three parties'
/// addresses in party order; this party listens on `peers[party]`.
pub async fn run_party(
    party: usize,
    peers: &[SocketAddr; 3],
    market: u32,
    credits: &[u64],
    orders: &[[u8; ORDER_LEN]],
    accounts: &[[u8; ACCOUNT_LEN]],
) -> Result<Outcome, Error> {
    let channel = TcpChannel::connect(party, peers).await?;
    run_party_on(&channel, party, market, credits, orders, accounts).await
}

/// Same as [`run_party`] over any polytune channel (e.g. one carried over HTTPS).
///
/// - `market`: the batch's market id, public; all three must pass the same one.
/// - `credits`: half-ticks to add to each table row before clearing (deposits, judge
///   credits), public; one per row, the same at all three.
/// - `orders`: this relayer's share of each of the [`N`] slots; pad with zero shares.
/// - `accounts`: this relayer's share of every balance-table row (`Account::encode`),
///   in the same order at all three; its length picks the table size.
///
/// Returns [`Error::Disagreement`] if the parties' markets or credits differ: then
/// nothing was cleared or credited.
///
/// Each party feeds a fresh random mask `m_p` into the circuit, which reveals
/// `shares ^ m_0 ^ m_1 ^ m_2` and the price to all three. Party 0's share is that output
/// `^ m_0`; party 1 and 2's shares are their own masks, so no party (nor any two) can
/// unmask a record, and the three shares XOR to `zpredict_core::clear_with_balances`.
pub async fn run_party_on(
    channel: &impl Channel,
    party: usize,
    market: u32,
    credits: &[u64],
    orders: &[[u8; ORDER_LEN]],
    accounts: &[[u8; ACCOUNT_LEN]],
) -> Result<Outcome, Error> {
    if orders.len() != N || credits.len() != accounts.len() {
        return Err(Error::Circuit(format!(
            "need {N} order slots and one credit per table row"
        )));
    }
    let prg = program(accounts.len());
    let mask = Outcome::random(accounts.len());
    let input = io::input_bits(prg, party, market, credits, orders, accounts, &mask)?;
    let out = polytune::mpc(channel, circuit(prg), &input, EVALUATOR, party, &ALL, None).await?;
    let out = io::decode_output(prg, &out)?;
    if party == EVALUATOR {
        return Ok(out.xor(&mask));
    }
    Ok(Outcome {
        price: out.price,
        ..mask
    })
}
