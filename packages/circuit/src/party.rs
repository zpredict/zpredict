use std::net::SocketAddr;

use polytune::channel::Channel;

use crate::{
    Error,
    io::{self, AccountShares, OrderShares, Outcome},
    net::TcpChannel,
    program::circuit,
};

/// The garbled-circuit evaluator, and the only party that receives (masked) output.
const EVALUATOR: usize = 0;

/// Runs one relayer's side of a batch over TCP. `peers` lists all three parties'
/// addresses in party order; this party listens on `peers[party]`.
pub async fn run_party(
    party: usize,
    peers: &[SocketAddr; 3],
    orders: &OrderShares,
    accounts: &AccountShares,
) -> Result<Outcome, Error> {
    let channel = TcpChannel::connect(party, peers).await?;
    run_party_on(&channel, party, orders, accounts).await
}

/// Same as [`run_party`] over any polytune channel (e.g. one carried over HTTPS).
///
/// Each party feeds a fresh random mask `m_p` into the circuit, which outputs
/// `outcome ^ m_0 ^ m_1 ^ m_2` to party 0 only. Party 0's share is that output `^ m_0`;
/// party 1 and 2's shares are their own masks. No party ever sees an unmasked value,
/// and the three shares XOR to `zpredict_core::clear_with_balances`' result.
pub async fn run_party_on(
    channel: &impl Channel,
    party: usize,
    orders: &OrderShares,
    accounts: &AccountShares,
) -> Result<Outcome, Error> {
    let mask = Outcome::random();
    let input = io::input_bits(party, orders, accounts, &mask)?;
    let out = polytune::mpc(
        channel,
        circuit(),
        &input,
        EVALUATOR,
        party,
        &[EVALUATOR],
        None,
    )
    .await?;
    if party != EVALUATOR {
        return Ok(mask);
    }
    Ok(io::decode_output(&out)?.xor(&mask))
}
