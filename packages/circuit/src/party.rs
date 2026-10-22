use std::net::SocketAddr;

use polytune::channel::Channel;

use crate::{
    Error,
    io::{self, FillShares, OrderShares},
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
    shares: &OrderShares,
) -> Result<FillShares, Error> {
    let channel = TcpChannel::connect(party, peers).await?;
    run_party_on(&channel, party, shares).await
}

/// Same as [`run_party`] over any polytune channel (e.g. one carried over HTTPS).
///
/// Each party feeds a fresh random mask `m_p` into the circuit, which outputs
/// `fills ^ m_0 ^ m_1 ^ m_2` to party 0 only. Party 0's share is that output `^ m_0`;
/// party 1 and 2's shares are their own masks. No party ever sees an unmasked record,
/// and the three shares XOR to `zpredict_core::fill_records(batch, &clear(batch))`.
pub async fn run_party_on(
    channel: &impl Channel,
    party: usize,
    shares: &OrderShares,
) -> Result<FillShares, Error> {
    let mask: FillShares = rand::random();
    let input = io::input_bits(party, shares, &mask)?;
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
    let mut fills = io::decode_output(&out)?;
    for (f, m) in fills.iter_mut().zip(&mask) {
        for (b, m) in f.iter_mut().zip(m) {
            *b ^= m;
        }
    }
    Ok(fills)
}
