//! Resolution payouts as a second, small MPC program (`resolve.garble.rs`).
//!
//! Relayers keep every batched order's share with its fill share: these are the
//! positions, and no relayer knows whose they are, which market they are in or whether
//! they filled. When a market resolves (public, from every relayer's own node), the
//! three run this program over all positions, [`DEFAULT_POSITIONS`] at a time: each
//! position that filled on the winning side of that market adds `size × 200` half-ticks
//! to its account's row, as shares. Nothing is revealed but whether the parties agreed.
//! Reference: `zpredict_core::resolve`. Run it exactly once per market.

use polytune::channel::Channel;
use polytune::garble_lang::GarbleProgram;
use polytune::garble_lang::literal::Literal;
use polytune::garble_lang::token::UnsignedNumType;
use zpredict_core::{ACCOUNT_LEN, BALANCE_LEN, FILL_LEN, KEY_LEN, ORDER_LEN, Side};

use crate::Error;
use crate::io::{self, bytes, rows};
use crate::party::{mpc, unmask};
use crate::program::{circuit, resolve_program};

/// Positions per run; pad with zero shares (they rebuild to unfilled records).
pub const DEFAULT_POSITIONS: usize = 16;

/// One position share: this relayer's share of an order and of its fill record.
pub type Position = ([u8; ORDER_LEN], [u8; FILL_LEN]);
/// This relayer's shares of the balance table: rows (`id | balance`) and row keys.
pub type Table<'a> = (&'a [[u8; ACCOUNT_LEN]], &'a [[u8; KEY_LEN]]);

fn input_bits(
    prg: &GarbleProgram,
    party: usize,
    market: u32,
    outcome: u8,
    positions: &[Position],
    (accounts, keys): Table,
    mask: &[[u8; BALANCE_LEN]],
) -> Result<Vec<bool>, Error> {
    let orders: Vec<_> = positions.iter().map(|p| p.0).collect();
    let fills: Vec<_> = positions.iter().map(|p| p.1).collect();
    let fields = vec![
        ("accounts", rows(accounts)),
        ("balance_mask", rows(mask)),
        ("fills", rows(&fills)),
        ("keys", rows(keys)),
        (
            "market",
            Literal::NumUnsigned(market.into(), UnsignedNumType::U32),
        ),
        ("orders", rows(&orders)),
        (
            "outcome",
            Literal::NumUnsigned(outcome.into(), UnsignedNumType::U8),
        ),
    ];
    io::party_bits(prg, party, fields)
}

fn decode(prg: &GarbleProgram, bits: &[bool]) -> Result<Vec<[u8; BALANCE_LEN]>, Error> {
    let [balances] = io::agreed_parts(prg, bits)?;
    bytes(balances)
}

/// One relayer's side of a resolution run: `market` resolved to `outcome` (both public,
/// the same at all three), over this relayer's shares of `positions` and of the whole
/// balance table (rows and keys). Returns this relayer's share of every row's new
/// balance.
pub async fn run_resolution_on(
    channel: &impl Channel,
    party: usize,
    market: u32,
    outcome: Side,
    positions: &[Position],
    table: Table<'_>,
) -> Result<Vec<[u8; BALANCE_LEN]>, Error> {
    let rows = table.0.len();
    if table.1.len() != rows {
        return Err(Error::Circuit("need a key per table row".into()));
    }
    let prg = resolve_program(positions.len(), rows);
    let mask: Vec<[u8; BALANCE_LEN]> = (0..rows).map(|_| rand::random()).collect();
    let input = input_bits(prg, party, market, outcome as u8, positions, table, &mask)?;
    let out = decode(prg, &mpc(channel, prg, &input, party).await?)?;
    Ok(unmask(party, out, mask, |a, b| io::xor_rows(a, b)))
}

/// Runs the resolution circuit in the clear with zero masks, for tests: whoever calls
/// this sees every position and balance. `outcomes` are raw bytes so tests can feed
/// invalid ones.
pub fn resolve_in_clear(
    markets: [u32; 3],
    outcomes: [u8; 3],
    positions: [&[Position]; 3],
    tables: [Table; 3],
) -> Result<Vec<[u8; BALANCE_LEN]>, Error> {
    let prg = resolve_program(positions[0].len(), tables[0].0.len());
    let zero = vec![[0; BALANCE_LEN]; tables[0].0.len()];
    let inputs = (0..3)
        .map(|p| {
            let (m, o) = (markets[p], outcomes[p]);
            input_bits(prg, p, m, o, positions[p], tables[p], &zero)
        })
        .collect::<Result<Vec<_>, _>>()?;
    decode(prg, &circuit(prg).eval(&inputs))
}
