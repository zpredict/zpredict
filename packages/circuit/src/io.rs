//! Shares and masks ↔ the circuits' input and output bits, via Garble literals.

use polytune::garble_lang::GarbleProgram;
use polytune::garble_lang::literal::Literal;
use polytune::garble_lang::token::UnsignedNumType;
use zpredict_core::{ACCOUNT_LEN, BALANCE_LEN, FILL_LEN, KEY_LEN, ORDER_LEN};

use crate::Error;

/// A batch's public inputs, the same at all three relayers.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Public {
    /// The markets this run clears; `0` pads unused slots. Its length picks the program:
    /// keep it fixed, e.g. [`DEFAULT_MARKETS`](crate::DEFAULT_MARKETS).
    pub markets: Vec<u32>,
    /// Half-ticks added to each table row before clearing (deposits, judge credits).
    pub credits: Vec<u64>,
    /// Each withdrawal slot's amount in half-ticks (0 = unused slot), taken from the row
    /// with its key only if the row covers it. Its length picks the program: keep it
    /// fixed, e.g. [`DEFAULT_WITHDRAWALS`](crate::DEFAULT_WITHDRAWALS).
    pub withdrawals: Vec<u64>,
}

impl Public {
    /// `markets` with no credits or withdrawals, for a `rows`-row table.
    pub fn markets(markets: &[u32], rows: usize) -> Self {
        Self {
            markets: markets.to_vec(),
            credits: vec![0; rows],
            withdrawals: vec![0; crate::DEFAULT_WITHDRAWALS],
        }
    }
}

/// One relayer's secret-shared inputs to a batch.
#[derive(Clone, Copy, Debug)]
pub struct Shares<'a> {
    /// Its share of each order slot, padded with zero shares; the length (2..=
    /// [`MAX_SLOTS`](crate::MAX_SLOTS)) picks the program.
    pub orders: &'a [[u8; ORDER_LEN]],
    /// Its share of every balance-table row (`Account::encode`), in the same order at all
    /// three; the length picks the table size.
    pub accounts: &'a [[u8; ACCOUNT_LEN]],
    /// Its share of every row's key, one per row: a row is usable only by an order or
    /// withdrawal carrying the same key, which no single relayer holds.
    pub keys: &'a [[u8; KEY_LEN]],
    /// Its share of each withdrawal slot's key, one per `Public::withdrawals` entry; zero
    /// shares for unused slots.
    pub withdrawals: &'a [[u8; KEY_LEN]],
    /// Per row, whether this relayer saw it opened by a judge claim (mock credit). Not a
    /// share: the circuit refuses withdrawals from a row any relayer flags, so one honest
    /// relayer that saw the claim is enough.
    pub mock: &'a [bool],
}

/// What one relayer gets back from a batch.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Outcome {
    /// This relayer's share of every slot's `zpredict_core::fill_records` record.
    pub fills: Vec<[u8; FILL_LEN]>,
    /// This relayer's share of every table row's new balance (`u64` LE half-ticks).
    pub balances: Vec<[u8; BALANCE_LEN]>,
    /// Each market slot's public clearing price (`zpredict_core::clearing_price`), in the
    /// order the markets were passed; `None` if nothing crossed. Not a share.
    pub prices: Vec<Option<u16>>,
    /// Per withdrawal slot (`Public::withdrawals`), whether it went through. Public.
    pub withdrawn: Vec<bool>,
}

impl Outcome {
    pub(crate) fn random(slots: usize, rows: usize) -> Self {
        Self {
            fills: (0..slots).map(|_| rand::random()).collect(),
            balances: (0..rows).map(|_| rand::random()).collect(),
            prices: Vec::new(),
            withdrawn: Vec::new(),
        }
    }

    /// XORs the shares (fills and balances), e.g. to combine them or strip a mask.
    /// The public outputs are kept from `self`.
    pub fn xor(&self, other: &Self) -> Self {
        Self {
            fills: xor_rows(&self.fills, &other.fills),
            balances: xor_rows(&self.balances, &other.balances),
            prices: self.prices.clone(),
            withdrawn: self.withdrawn.clone(),
        }
    }
}

pub(crate) fn xor_rows<const L: usize>(a: &[[u8; L]], b: &[[u8; L]]) -> Vec<[u8; L]> {
    a.iter()
        .zip(b)
        .map(|(a, b)| std::array::from_fn(|k| a[k] ^ b[k]))
        .collect()
}

pub(crate) fn rows<const L: usize>(rows: &[[u8; L]]) -> Literal {
    let byte = |b: &u8| Literal::NumUnsigned(*b as u64, UnsignedNumType::U8);
    Literal::Array(
        rows.iter()
            .map(|r| Literal::Array(r.iter().map(byte).collect()))
            .collect(),
    )
}

fn bool_lit(b: bool) -> Literal {
    if b { Literal::True } else { Literal::False }
}

pub(crate) fn nums(values: impl Iterator<Item = u64>, ty: UnsignedNumType) -> Literal {
    Literal::Array(values.map(|v| Literal::NumUnsigned(v, ty)).collect())
}

/// A `Party` struct input. Garble lays out struct inputs by field name, not declaration
/// order, so `fields` must be sorted by name.
pub(crate) fn party_bits(
    prg: &GarbleProgram,
    party: usize,
    fields: Vec<(&str, Literal)>,
) -> Result<Vec<bool>, Error> {
    debug_assert!(fields.windows(2).all(|w| w[0].0 < w[1].0));
    let fields = fields.into_iter().map(|(k, v)| (k.into(), v)).collect();
    let arg = prg
        .literal_arg(party, Literal::Struct("Party".into(), fields))
        .map_err(|e| Error::Circuit(format!("{e:?}")))?;
    Ok(arg.as_bits())
}

/// Party `party`'s clearing input: its shares, the public inputs, and the mask it puts
/// on every masked output.
pub(crate) fn input_bits(
    prg: &GarbleProgram,
    party: usize,
    public: &Public,
    shares: &Shares,
    mask: &Outcome,
) -> Result<Vec<bool>, Error> {
    let u64s = |v: &[u64]| nums(v.iter().copied(), UnsignedNumType::U64);
    let markets = nums(
        public.markets.iter().map(|&m| m.into()),
        UnsignedNumType::U32,
    );
    let fields = vec![
        ("accounts", rows(shares.accounts)),
        ("balance_mask", rows(&mask.balances)),
        ("credits", u64s(&public.credits)),
        ("fill_mask", rows(&mask.fills)),
        ("keys", rows(shares.keys)),
        ("markets", markets),
        (
            "mock",
            Literal::Array(shares.mock.iter().map(|&b| bool_lit(b)).collect()),
        ),
        ("orders", rows(shares.orders)),
        ("withdraw_keys", rows(shares.withdrawals)),
        ("withdrawals", u64s(&public.withdrawals)),
    ];
    party_bits(prg, party, fields)
}

pub(crate) fn bytes<const L: usize>(lit: Literal) -> Result<Vec<[u8; L]>, Error> {
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

/// The output tuple's parts, after checking its last element, the public `agreed` flag.
pub(crate) fn agreed_parts<const K: usize>(
    prg: &GarbleProgram,
    bits: &[bool],
) -> Result<[Literal; K], Error> {
    let out = prg
        .parse_output(bits)
        .map_err(|e| Error::Circuit(format!("{e:?}")))?;
    let bad = || Error::Circuit("unexpected output shape".into());
    let Literal::Tuple(mut parts) = out else {
        return Err(bad());
    };
    if parts.pop() != Some(Literal::True) {
        return Err(Error::Disagreement);
    }
    <[Literal; K]>::try_from(parts).map_err(|_| bad())
}

/// Turns the clearing output bits back into an [`Outcome`] (shares still masked, if
/// under MPC). Errors if the parties disagreed on the public inputs.
pub(crate) fn decode_output(prg: &GarbleProgram, bits: &[bool]) -> Result<Outcome, Error> {
    let [fills, balances, prices, withdrawn] = agreed_parts(prg, bits)?;
    let bad = || Error::Circuit("unexpected output shape".into());
    let (Literal::Array(prices), Literal::Array(withdrawn)) = (prices, withdrawn) else {
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
        withdrawn: withdrawn.into_iter().map(|w| w == Literal::True).collect(),
    })
}
