//! Shares and masks ↔ the circuit's input and output bits, via Garble literals.

use polytune::garble_lang::GarbleProgram;
use polytune::garble_lang::literal::Literal;
use polytune::garble_lang::token::UnsignedNumType;
use zpredict_core::{ACCOUNT_LEN, BALANCE_LEN, FILL_LEN, ORDER_LEN};

use crate::{Error, N};

/// One relayer's shares of a batch: slot `i` holds its share of order `i`.
pub type OrderShares = [[u8; ORDER_LEN]; N];

/// What one relayer gets back from a batch.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Outcome {
    /// This relayer's share of every slot's `zpredict_core::fill_records` record.
    pub fills: Vec<[u8; FILL_LEN]>,
    /// This relayer's share of every table row's new balance (`u64` LE half-ticks).
    pub balances: Vec<[u8; BALANCE_LEN]>,
    /// The batch's public clearing price (`zpredict_core::clearing_price`), the same at
    /// all three relayers; `None` if nothing crossed. Not a share.
    pub price: Option<u16>,
}

impl Outcome {
    pub(crate) fn random(rows: usize) -> Self {
        Self {
            fills: (0..N).map(|_| rand::random()).collect(),
            balances: (0..rows).map(|_| rand::random()).collect(),
            price: None,
        }
    }

    /// XORs the shares (fills and balances), e.g. to combine them or strip a mask.
    /// The price is public, so it is kept from `self`.
    pub fn xor(&self, other: &Self) -> Self {
        Self {
            fills: xor_rows(&self.fills, &other.fills),
            balances: xor_rows(&self.balances, &other.balances),
            price: self.price,
        }
    }
}

fn xor_rows<const L: usize>(a: &[[u8; L]], b: &[[u8; L]]) -> Vec<[u8; L]> {
    a.iter()
        .zip(b)
        .map(|(a, b)| std::array::from_fn(|k| a[k] ^ b[k]))
        .collect()
}

fn rows<const L: usize>(rows: &[[u8; L]]) -> Literal {
    let byte = |b: &u8| Literal::NumUnsigned(*b as u64, UnsignedNumType::U8);
    Literal::Array(
        rows.iter()
            .map(|r| Literal::Array(r.iter().map(byte).collect()))
            .collect(),
    )
}

/// Party `party`'s input: its shares, the public market and credits, and the mask it
/// puts on every masked output.
#[allow(clippy::too_many_arguments)] // one per circuit input; a struct would just rename them
pub(crate) fn input_bits(
    prg: &GarbleProgram,
    party: usize,
    market: u32,
    credits: &[u64],
    orders: &[[u8; ORDER_LEN]],
    accounts: &[[u8; ACCOUNT_LEN]],
    mask: &Outcome,
) -> Result<Vec<bool>, Error> {
    // Alphabetical: Garble lays out struct inputs by field name, not declaration order.
    let fields = [
        ("accounts", rows(accounts)),
        ("balance_mask", rows(&mask.balances)),
        (
            "credits",
            Literal::Array(
                credits
                    .iter()
                    .map(|c| Literal::NumUnsigned(*c, UnsignedNumType::U64))
                    .collect(),
            ),
        ),
        ("fill_mask", rows(&mask.fills)),
        (
            "market",
            Literal::NumUnsigned(market as u64, UnsignedNumType::U32),
        ),
        ("orders", rows(orders)),
    ];
    let arg = Literal::Struct(
        "Party".into(),
        fields.into_iter().map(|(k, v)| (k.into(), v)).collect(),
    );
    let arg = prg
        .literal_arg(party, arg)
        .map_err(|e| Error::Circuit(format!("{e:?}")))?;
    Ok(arg.as_bits())
}

fn bytes<const L: usize>(lit: Literal) -> Result<Vec<[u8; L]>, Error> {
    let bad = || Error::Circuit("unexpected output shape".into());
    let Literal::Array(slots) = lit else {
        return Err(bad());
    };
    slots
        .into_iter()
        .map(|slot| {
            let Literal::Array(bytes) = slot else {
                return Err(bad());
            };
            let mut row = [0u8; L];
            for (b, lit) in row.iter_mut().zip(bytes) {
                let Literal::NumUnsigned(v, _) = lit else {
                    return Err(bad());
                };
                *b = v as u8;
            }
            Ok(row)
        })
        .collect()
}

/// Turns the output bits back into an [`Outcome`] (shares still masked, if under MPC).
/// Errors if the parties disagreed on the public inputs.
pub(crate) fn decode_output(prg: &GarbleProgram, bits: &[bool]) -> Result<Outcome, Error> {
    let out = prg
        .parse_output(bits)
        .map_err(|e| Error::Circuit(format!("{e:?}")))?;
    let bad = || Error::Circuit("output is not (fills, balances, price, agreed)".into());
    let Literal::Tuple(parts) = out else {
        return Err(bad());
    };
    let [fills, balances, price, agreed] = <[Literal; 4]>::try_from(parts).map_err(|_| bad())?;
    if agreed != Literal::True {
        return Err(Error::Disagreement);
    }
    let Literal::NumUnsigned(price, _) = price else {
        return Err(bad());
    };
    Ok(Outcome {
        fills: bytes(fills)?,
        balances: bytes(balances)?,
        price: (price != 0).then_some(price as u16),
    })
}
