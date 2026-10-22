use std::net::SocketAddr;

use polytune::channel::Channel;
use polytune::garble_lang::GarbleProgram;
use zpredict_core::{ACCOUNT_LEN, ORDER_LEN};

use crate::{
    Error,
    io::{self, Outcome, Public},
    net::TcpChannel,
    program::{circuit, program},
};

/// The garbled-circuit evaluator.
const EVALUATOR: usize = 0;
/// Everyone receives the output: shares stay masked, and the public outputs are public.
const ALL: [usize; 3] = [0, 1, 2];

/// Runs one relayer's side of a batch over TCP. `peers` lists all three parties'
/// addresses in party order; this party listens on `peers[party]`.
pub async fn run_party(
    party: usize,
    peers: &[SocketAddr; 3],
    public: &Public,
    orders: &[[u8; ORDER_LEN]],
    accounts: &[[u8; ACCOUNT_LEN]],
) -> Result<Outcome, Error> {
    let channel = TcpChannel::connect(party, peers).await?;
    run_party_on(&channel, party, public, orders, accounts).await
}

/// Same as [`run_party`] over any polytune channel (e.g. one carried over HTTPS).
///
/// - `public`: the batch's markets, credits and withdrawals ([`Public`]), the same at
///   all three. Orders only cross within their own market.
/// - `orders`: this relayer's share of each order slot, padded with zero shares; its
///   length (2..=[`MAX_SLOTS`](crate::MAX_SLOTS), e.g.
///   [`DEFAULT_SLOTS`](crate::DEFAULT_SLOTS)) picks the program.
/// - `accounts`: this relayer's share of every balance-table row (`Account::encode`),
///   in the same order at all three; its length picks the table size.
///
/// Returns [`Error::Disagreement`] if the parties' public inputs differ: then nothing
/// was cleared, credited or withdrawn.
///
/// Each party feeds a fresh random mask `m_p` into the circuit, which reveals
/// `shares ^ m_0 ^ m_1 ^ m_2` and the public outputs to all three. Party 0's share is that
/// output `^ m_0`; party 1 and 2's shares are their own masks, so no party (nor any two)
/// can unmask a record, and the three shares XOR to `zpredict_core::apply_flows` then
/// `zpredict_core::clear_with_balances`.
pub async fn run_party_on(
    channel: &impl Channel,
    party: usize,
    public: &Public,
    orders: &[[u8; ORDER_LEN]],
    accounts: &[[u8; ACCOUNT_LEN]],
) -> Result<Outcome, Error> {
    let rows = accounts.len();
    if !(2..=crate::MAX_SLOTS).contains(&orders.len())
        || public.credits.len() != rows
        || public.debits.len() != rows
    {
        return Err(Error::Circuit(
            "need 2..=21 order slots and one credit and one debit per table row".into(),
        ));
    }
    let prg = program(orders.len(), rows, public.markets.len());
    let mask = Outcome::random(orders.len(), rows);
    let input = io::input_bits(prg, party, public, orders, accounts, &mask)?;
    let out = io::decode_output(prg, &mpc(channel, prg, &input, party).await?)?;
    if party == EVALUATOR {
        return Ok(out.xor(&mask));
    }
    Ok(Outcome {
        prices: out.prices,
        withdrawn: out.withdrawn,
        ..mask
    })
}

/// One polytune run of `prg`; every party gets the (masked) output.
pub(crate) async fn mpc(
    channel: &impl Channel,
    prg: &GarbleProgram,
    input: &[bool],
    party: usize,
) -> Result<Vec<bool>, Error> {
    let circuit = circuit(prg);
    Ok(polytune::mpc(channel, circuit, input, EVALUATOR, party, &ALL, None).await?)
}

/// Party 0's share is the masked output XOR its own mask; parties 1 and 2 keep their
/// masks as their shares.
pub(crate) fn unmask<T>(party: usize, masked: T, mask: T, xor: impl Fn(&T, &T) -> T) -> T {
    if party == EVALUATOR {
        xor(&masked, &mask)
    } else {
        mask
    }
}
