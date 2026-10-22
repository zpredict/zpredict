//! Shares and masks ↔ the circuit's input and output bits, via Garble literals.

use polytune::garble_lang::GarbleProgram;
use polytune::garble_lang::literal::Literal;
use polytune::garble_lang::token::UnsignedNumType;
use zpredict_core::{ACCOUNT_LEN, BALANCE_LEN, FILL_LEN, ORDER_LEN};

use crate::Error;

/// What one relayer gets back from a batch.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Outcome {
    /// This relayer's share of every slot's `zpredict_core::fill_records` record.
    pub fills: Vec<[u8; FILL_LEN]>,
    /// This relayer's share of every table row's new balance (`u64` LE half-ticks).
    pub balances: Vec<[u8; BALANCE_LEN]>,
    /// Each market slot's public clearing price (`zpredict_core::clearing_price`), in the
    /// order the markets were passed; the same at
    /// all three relayers; `None` if nothing crossed. Not a share.
    pub prices: Vec<Option<u16>>,
}

impl Outcome {
    pub(crate) fn random(slots: usize, rows: usize) -> Self {
        Self {
            fills: (0..slots).map(|_| rand::random()).collect(),
            balances: (0..rows).map(|_| rand::random()).collect(),
            prices: Vec::new(),
        }
    }

    /// XORs the shares (fills and balances), e.g. to combine them or strip a mask.
    /// The prices are public, so they are kept from `self`.
    pub fn xor(&self, other: &Self) -> Self {
        Self {
            fills: xor_rows(&self.fills, &other.fills),
            balances: xor_rows(&self.balances, &other.balances),
            prices: self.prices.clone(),
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

fn nums(values: impl Iterator<Item = u64>, ty: UnsignedNumType) -> Literal {
    Literal::Array(values.map(|v| Literal::NumUnsigned(v, ty)).collect())
}

/// Party `party`'s input: its shares, the public markets and credits, and the mask it
/// puts on every masked output.
#[allow(clippy::too_many_arguments)] // one per circuit input; a struct would just rename them
pub(crate) fn input_bits(
    prg: &GarbleProgram,
    party: usize,
    markets: &[u32],
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
            nums(credits.iter().copied(), UnsignedNumType::U64),
        ),
        ("fill_mask", rows(&mask.fills)),
        (
            "markets",
            nums(markets.iter().map(|&m| m as u64), UnsignedNumType::U32),
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
    let bad = || Error::Circuit("output is not (fills, balances, prices, agreed)".into());
    let Literal::Tuple(parts) = out else {
        return Err(bad());
    };
    let [fills, balances, prices, agreed] = <[Literal; 4]>::try_from(parts).map_err(|_| bad())?;
    if agreed != Literal::True {
        return Err(Error::Disagreement);
    }
    let Literal::Array(prices) = prices else {
        return Err(bad());
    };
    let price = |p: Literal| match p {
        Literal::NumUnsigned(p, _) => Ok((p != 0).then_some(p as u16)),
        _ => Err(bad()),
    };
    Ok(Outcome {
        fills: bytes(fills)?,
        balances: bytes(balances)?,
        prices: prices.into_iter().map(price).collect::<Result<_, _>>()?,
    })
}
