use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

use polytune::garble_lang::{
    CircuitKind, CompileOptions, GarbleProgram, compile_with_options, register_circuit::Circuit,
};
use zpredict_core::{ACCOUNT_LEN, ORDER_LEN};

use crate::{Error, io};

/// Order slots per batch, shared by all its markets, unless a relayer picks another.
/// Crossing costs ~N² AND gates, so this is the main latency knob (crate docs): 8 keeps
/// a fill within ~22 s on the demo's shared VPS, 16 would take ~57 s (#66).
pub const DEFAULT_SLOTS: usize = 8;
/// Most order slots a batch can have: sums stay in u32 while N × MAX_SIZE × 198 < 2^32.
pub const MAX_SLOTS: usize = 21;
/// Balance-table rows a relayer should use unless it has a reason not to. Any size
/// works; each needs its own compile and costs ~8k AND gates per row (timings in the
/// crate docs).
pub const DEFAULT_ROWS: usize = 32;
/// Market slots per run. Pad unused slots with market id 0; a deployment with more open
/// markets runs once per group of this many.
pub const DEFAULT_MARKETS: usize = 4;

const SOURCE: &str = include_str!("clear.garble.rs");

/// The clearing program for `slots` order slots, a `rows`-row balance table and
/// `markets` market slots.
/// Compiling takes several seconds (more for bigger tables), so each shape compiles once
/// per process; call this at startup to keep it out of the first batch.
pub fn program(slots: usize, rows: usize, markets: usize) -> &'static GarbleProgram {
    type Cache = Mutex<HashMap<(usize, usize, usize), &'static GarbleProgram>>;
    static PROGRAMS: OnceLock<Cache> = OnceLock::new();
    let mut cache = PROGRAMS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    cache.entry((slots, rows, markets)).or_insert_with(|| {
        assert!(
            (2..=MAX_SLOTS).contains(&slots),
            "need 2..={MAX_SLOTS} order slots"
        );
        assert!(
            rows > 0 && markets > 0,
            "need at least one row and one market"
        );
        let source = SOURCE
            .replace("{n}", &slots.to_string())
            .replace("{rows}", &rows.to_string())
            .replace("{markets}", &markets.to_string());
        let opts = CompileOptions {
            circuit_kind: CircuitKind::Register,
            ..Default::default()
        };
        let prg = compile_with_options(&source, opts)
            .unwrap_or_else(|e| panic!("{}", e.prettify(&source)));
        Box::leak(Box::new(prg))
    })
}

pub(crate) fn circuit(prg: &GarbleProgram) -> &Circuit {
    prg.circuit.unwrap_register_ref()
}

/// Number of AND gates for this shape, the cost driver of the MPC.
pub fn and_gates(slots: usize, rows: usize, markets: usize) -> usize {
    circuit(program(slots, rows, markets)).and_ops
}

/// Runs the circuit in the clear on all three parties' inputs, with zero output masks.
/// For tests and debugging only: whoever calls this sees every order and balance.
pub fn eval_in_clear(
    markets: [&[u32]; 3],
    credits: [&[u64]; 3],
    orders: [&[[u8; ORDER_LEN]]; 3],
    accounts: [&[[u8; ACCOUNT_LEN]]; 3],
) -> Result<io::Outcome, Error> {
    let prg = program(orders[0].len(), accounts[0].len(), markets[0].len());
    let zero = io::Outcome {
        fills: vec![[0; zpredict_core::FILL_LEN]; orders[0].len()],
        balances: vec![[0; zpredict_core::BALANCE_LEN]; accounts[0].len()],
        prices: Vec::new(),
    };
    let inputs = (0..3)
        .map(|p| {
            let (m, c, o, a) = (markets[p], credits[p], orders[p], accounts[p]);
            io::input_bits(prg, p, m, c, o, a, &zero)
        })
        .collect::<Result<Vec<_>, _>>()?;
    io::decode_output(prg, &circuit(prg).eval(&inputs))
}
