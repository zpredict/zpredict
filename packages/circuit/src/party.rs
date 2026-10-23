use std::net::SocketAddr;

use polytune::Preprocessed;
use polytune::channel::Channel;
use polytune::garble_lang::GarbleProgram;

use crate::{
    Error,
    io::{self, Outcome, Public, Shares},
    net::TcpChannel,
    program::{circuit, shape},
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
    shares: &Shares<'_>,
) -> Result<Outcome, Error> {
    let channel = TcpChannel::connect(party, peers).await?;
    run_party_on(&channel, party, public, shares).await
}

/// Same as [`run_party`] over any polytune channel (e.g. one carried over HTTPS).
///
/// - `public`: the batch's markets, credits and withdrawal amounts ([`Public`]), the
///   same at all three. Orders only cross within their own market.
/// - `shares`: this relayer's shares of the orders, the balance table and the
///   withdrawals' accounts ([`Shares`]).
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
    shares: &Shares<'_>,
) -> Result<Outcome, Error> {
    run_party_with(channel, party, public, shares, None).await
}

/// The input-independent ~92% of a run of `prg` (a [`crate::program`]), which all three
/// relayers can do before they know the batch: then [`run_party_with`] only feeds the
/// inputs, evaluates and reveals. Use it for exactly one run.
pub async fn preprocess(
    channel: &impl Channel,
    party: usize,
    prg: &GarbleProgram,
) -> Result<Preprocessed, Error> {
    let circuit = circuit(prg);
    Ok(polytune::mpc_preprocess(channel, circuit, EVALUATOR, party, &ALL).await?)
}

/// [`run_party_on`], optionally on material from [`preprocess`] for the same program
/// (`program(slots, rows, markets.len(), withdrawals.len())`); else it preprocesses too.
pub async fn run_party_with(
    channel: &impl Channel,
    party: usize,
    public: &Public,
    shares: &Shares<'_>,
    pre: Option<Preprocessed>,
) -> Result<Outcome, Error> {
    let (slots, rows) = (shares.orders.len(), shares.accounts.len());
    if !(2..=crate::MAX_SLOTS).contains(&slots)
        || public.credits.len() != rows
        || shares.keys.len() != rows
        || shares.mock.len() != rows
        || public.withdrawals.len() != shares.withdrawals.len()
    {
        return Err(Error::Circuit(
            "need 2..=21 order slots, a credit, key and mock flag per row, a share per withdrawal"
                .into(),
        ));
    }
    let prg = shape(public, shares);
    let mask = Outcome::random(slots, rows);
    let input = io::input_bits(prg, party, public, shares, &mask)?;
    let out = match pre {
        Some(pre) => {
            let c = circuit(prg);
            polytune::mpc_online(channel, c, pre, &input, EVALUATOR, party, &ALL).await?
        }
        None => mpc(channel, prg, &input, party).await?,
    };
    let out = io::decode_output(prg, &out)?;
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
