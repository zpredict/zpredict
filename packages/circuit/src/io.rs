//! Shares and masks ↔ the circuit's input and output bits, via Garble literals.

use polytune::garble_lang::literal::Literal;
use polytune::garble_lang::token::UnsignedNumType;
use zpredict_core::{FILL_LEN, ORDER_LEN};

use crate::{Error, N, program::program};

/// One relayer's shares of a batch: slot `i` holds its share of order `i`.
pub type OrderShares = [[u8; ORDER_LEN]; N];
/// One relayer's shares of the batch's fill records (`zpredict_core::fill_records`).
pub type FillShares = [[u8; FILL_LEN]; N];

fn rows<const L: usize>(rows: &[[u8; L]; N]) -> Literal {
    let byte = |b: &u8| Literal::NumUnsigned(*b as u64, UnsignedNumType::U8);
    Literal::Array(
        rows.iter()
            .map(|r| Literal::Array(r.iter().map(byte).collect()))
            .collect(),
    )
}

/// Party `party`'s input: `(order shares, output mask)`.
pub(crate) fn input_bits(
    party: usize,
    shares: &OrderShares,
    mask: &FillShares,
) -> Result<Vec<bool>, Error> {
    let arg = Literal::Tuple(vec![rows(shares), rows(mask)]);
    let arg = program()
        .literal_arg(party, arg)
        .map_err(|e| Error::Circuit(format!("{e:?}")))?;
    Ok(arg.as_bits())
}

/// Turns the output bits back into `N` fill records (still masked, if run under MPC).
pub(crate) fn decode_output(bits: &[bool]) -> Result<FillShares, Error> {
    let bad = |what: &str| Error::Circuit(format!("unexpected output: {what}"));
    let out = program()
        .parse_output(bits)
        .map_err(|e| Error::Circuit(format!("{e:?}")))?;
    let Literal::Array(slots) = out else {
        return Err(bad("not an array"));
    };
    let mut fills = [[0u8; FILL_LEN]; N];
    for (fill, slot) in fills.iter_mut().zip(slots) {
        let Literal::Array(bytes) = slot else {
            return Err(bad("slot is not an array"));
        };
        for (b, lit) in fill.iter_mut().zip(bytes) {
            let Literal::NumUnsigned(v, _) = lit else {
                return Err(bad("byte is not a number"));
            };
            *b = v as u8;
        }
    }
    Ok(fills)
}
