//! Shares and masks ↔ the circuit's input and output bits, via Garble literals.

use polytune::garble_lang::literal::Literal;
use polytune::garble_lang::token::UnsignedNumType;
use zpredict_core::{ACCOUNT_LEN, BALANCE_LEN, FILL_LEN, ORDER_LEN};

use crate::{ACCOUNTS, Error, N, program::program};

/// One relayer's shares of a batch: slot `i` holds its share of order `i`.
pub type OrderShares = [[u8; ORDER_LEN]; N];
/// One relayer's shares of the balance table (`zpredict_core::Account::encode` rows).
/// Pad unused rows with shares of an all-zero row.
pub type AccountShares = [[u8; ACCOUNT_LEN]; ACCOUNTS];
/// One relayer's shares of the batch's fill records (`zpredict_core::fill_records`).
pub type FillShares = [[u8; FILL_LEN]; N];
/// One relayer's shares of each table row's new balance (`u64` LE half-ticks).
pub type BalanceShares = [[u8; BALANCE_LEN]; ACCOUNTS];

/// What one relayer gets back from a batch: its share of every fill record and of
/// every row's updated balance.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Outcome {
    pub fills: FillShares,
    pub balances: BalanceShares,
}

impl Outcome {
    pub(crate) fn random() -> Self {
        Self {
            fills: rand::random(),
            balances: rand::random(),
        }
    }

    /// Byte-wise XOR, e.g. to combine shares or strip a mask.
    pub fn xor(&self, other: &Self) -> Self {
        Self {
            fills: xor_rows(&self.fills, &other.fills),
            balances: xor_rows(&self.balances, &other.balances),
        }
    }
}

fn xor_rows<const L: usize, const R: usize>(a: &[[u8; L]; R], b: &[[u8; L]; R]) -> [[u8; L]; R] {
    std::array::from_fn(|i| std::array::from_fn(|k| a[i][k] ^ b[i][k]))
}

fn rows<const L: usize, const R: usize>(rows: &[[u8; L]; R]) -> Literal {
    let byte = |b: &u8| Literal::NumUnsigned(*b as u64, UnsignedNumType::U8);
    Literal::Array(
        rows.iter()
            .map(|r| Literal::Array(r.iter().map(byte).collect()))
            .collect(),
    )
}

/// Party `party`'s input: its shares plus the mask it puts on every output.
pub(crate) fn input_bits(
    party: usize,
    orders: &OrderShares,
    accounts: &AccountShares,
    mask: &Outcome,
) -> Result<Vec<bool>, Error> {
    // Alphabetical: Garble lays out struct inputs by field name, not declaration order.
    let fields = [
        ("accounts", rows(accounts)),
        ("balance_mask", rows(&mask.balances)),
        ("fill_mask", rows(&mask.fills)),
        ("orders", rows(orders)),
    ];
    let arg = Literal::Struct(
        "Party".into(),
        fields.into_iter().map(|(k, v)| (k.into(), v)).collect(),
    );
    let arg = program()
        .literal_arg(party, arg)
        .map_err(|e| Error::Circuit(format!("{e:?}")))?;
    Ok(arg.as_bits())
}

fn bytes<const L: usize, const R: usize>(lit: Literal) -> Result<[[u8; L]; R], Error> {
    let bad = || Error::Circuit("unexpected output shape".into());
    let Literal::Array(slots) = lit else {
        return Err(bad());
    };
    let mut out = [[0u8; L]; R];
    for (row, slot) in out.iter_mut().zip(slots) {
        let Literal::Array(bytes) = slot else {
            return Err(bad());
        };
        for (b, lit) in row.iter_mut().zip(bytes) {
            let Literal::NumUnsigned(v, _) = lit else {
                return Err(bad());
            };
            *b = v as u8;
        }
    }
    Ok(out)
}

/// Turns the output bits back into an [`Outcome`] (still masked, if run under MPC).
pub(crate) fn decode_output(bits: &[bool]) -> Result<Outcome, Error> {
    let out = program()
        .parse_output(bits)
        .map_err(|e| Error::Circuit(format!("{e:?}")))?;
    let bad = || Error::Circuit("output is not a (fills, balances) pair".into());
    let Literal::Tuple(parts) = out else {
        return Err(bad());
    };
    let [fills, balances] = <[Literal; 2]>::try_from(parts).map_err(|_| bad())?;
    Ok(Outcome {
        fills: bytes(fills)?,
        balances: bytes(balances)?,
    })
}
