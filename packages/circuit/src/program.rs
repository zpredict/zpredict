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

const CLEAR: &str = include_str!("clear.garble.rs");
const RESOLVE: &str = include_str!("resolve.garble.rs");

/// Compiles `template` with its `{name}` placeholders filled in, once per process and
/// shape: compiling takes seconds, so call the public constructors at startup.
fn compiled(template: &str, params: &[(&str, usize)]) -> &'static GarbleProgram {
    static PROGRAMS: OnceLock<Mutex<HashMap<String, &'static GarbleProgram>>> = OnceLock::new();
    let source = params.iter().fold(template.to_owned(), |s, (name, v)| {
        s.replace(&format!("{{{name}}}"), &v.to_string())
    });
    let mut cache = PROGRAMS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    cache.entry(source).or_insert_with_key(|source| {
        let opts = CompileOptions {
            circuit_kind: CircuitKind::Register,
            ..Default::default()
        };
        let prg =
            compile_with_options(source, opts).unwrap_or_else(|e| panic!("{}", e.prettify(source)));
        Box::leak(Box::new(prg))
    })
}

/// The clearing program for `slots` order slots, a `rows`-row balance table and
/// `markets` market slots. Compiling takes several seconds (more for bigger tables).
pub fn program(slots: usize, rows: usize, markets: usize) -> &'static GarbleProgram {
    assert!(
        (2..=MAX_SLOTS).contains(&slots),
        "need 2..={MAX_SLOTS} order slots"
    );
    assert!(
        rows > 0 && markets > 0,
        "need at least one row and one market"
    );
    let params = [("n", slots), ("rows", rows), ("markets", markets)];
    compiled(CLEAR, &params)
}

/// The resolution program for `positions` positions per run and a `rows`-row table.
pub fn resolve_program(positions: usize, rows: usize) -> &'static GarbleProgram {
    assert!(positions > 0 && rows > 0, "need a position and a row");
    compiled(RESOLVE, &[("k", positions), ("rows", rows)])
}

pub(crate) fn circuit(prg: &GarbleProgram) -> &Circuit {
    prg.circuit.unwrap_register_ref()
}

/// Number of AND gates of a compiled program, the cost driver of the MPC.
pub fn and_gates(prg: &GarbleProgram) -> usize {
    circuit(prg).and_ops
}

/// Runs the clearing circuit in the clear on all three parties' inputs, with zero
/// output masks. For tests and debugging only: whoever calls this sees every order and
/// balance.
pub fn eval_in_clear(
    public: [&io::Public; 3],
    orders: [&[[u8; ORDER_LEN]]; 3],
    accounts: [&[[u8; ACCOUNT_LEN]]; 3],
) -> Result<io::Outcome, Error> {
    let prg = program(orders[0].len(), accounts[0].len(), public[0].markets.len());
    let zero = io::Outcome {
        fills: vec![[0; zpredict_core::FILL_LEN]; orders[0].len()],
        balances: vec![[0; zpredict_core::BALANCE_LEN]; accounts[0].len()],
        prices: Vec::new(),
        withdrawn: Vec::new(),
    };
    let inputs = (0..3)
        .map(|p| io::input_bits(prg, p, public[p], orders[p], accounts[p], &zero))
        .collect::<Result<Vec<_>, _>>()?;
    io::decode_output(prg, &circuit(prg).eval(&inputs))
}
