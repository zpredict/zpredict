use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

use polytune::garble_lang::{
    CircuitKind, CompileOptions, GarbleProgram, compile_with_options, register_circuit::Circuit,
};
use zpredict_core::{ACCOUNT_LEN, ORDER_LEN};

use crate::{Error, io};

/// Orders per batch; the Garble source hard-codes the same number.
pub const N: usize = 16;
/// Balance-table rows a relayer should use unless it has a reason not to. Any size
/// works; each needs its own compile and costs ~8k AND gates per row (timings in the
/// crate docs).
pub const DEFAULT_ROWS: usize = 32;

const SOURCE: &str = include_str!("clear.garble.rs");

/// The clearing program for a `rows`-row balance table. Compiling takes several seconds
/// (more for bigger tables), so each size compiles once per process; call this at
/// startup to keep it out of the first batch.
pub fn program(rows: usize) -> &'static GarbleProgram {
    static PROGRAMS: OnceLock<Mutex<HashMap<usize, &'static GarbleProgram>>> = OnceLock::new();
    let mut cache = PROGRAMS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    cache.entry(rows).or_insert_with(|| {
        assert!(rows > 0, "the balance table needs at least one row");
        let source = SOURCE.replace("{rows}", &rows.to_string());
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

/// Number of AND gates for a `rows`-row table, the cost driver of the MPC.
pub fn and_gates(rows: usize) -> usize {
    circuit(program(rows)).and_ops
}

/// Runs the circuit in the clear on all three parties' inputs, with zero output masks.
/// For tests and debugging only: whoever calls this sees every order and balance.
pub fn eval_in_clear(
    markets: [u32; 3],
    credits: [&[u64]; 3],
    orders: [&[[u8; ORDER_LEN]]; 3],
    accounts: [&[[u8; ACCOUNT_LEN]]; 3],
) -> Result<io::Outcome, Error> {
    let prg = program(accounts[0].len());
    let zero = io::Outcome {
        fills: vec![[0; zpredict_core::FILL_LEN]; N],
        balances: vec![[0; zpredict_core::BALANCE_LEN]; accounts[0].len()],
        price: None,
    };
    let inputs = (0..3)
        .map(|p| {
            io::input_bits(
                prg,
                p,
                markets[p],
                credits[p],
                orders[p],
                accounts[p],
                &zero,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    io::decode_output(prg, &circuit(prg).eval(&inputs))
}
