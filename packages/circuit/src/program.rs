use std::sync::OnceLock;

use polytune::garble_lang::{
    CircuitKind, CompileOptions, GarbleProgram, compile_with_options, register_circuit::Circuit,
};

use crate::{Error, io};

/// Orders per batch; the Garble source hard-codes the same number.
pub const N: usize = 16;
/// Rows in the balance table; also hard-coded in the Garble source.
///
/// ponytail: the table holds every funded account, so 16 accounts is the system's
/// ceiling; raise it (~9k AND gates per row) or rotate rows across batches when
/// more traders show up.
pub const ACCOUNTS: usize = 16;

const SOURCE: &str = include_str!("clear.garble.rs");

/// The compiled clearing program. Compiling takes several seconds, so it happens once
/// per process; call this at startup to keep it out of the first batch.
pub fn program() -> &'static GarbleProgram {
    static PROGRAM: OnceLock<GarbleProgram> = OnceLock::new();
    PROGRAM.get_or_init(|| {
        let opts = CompileOptions {
            circuit_kind: CircuitKind::Register,
            ..Default::default()
        };
        compile_with_options(SOURCE, opts).unwrap_or_else(|e| panic!("{}", e.prettify(SOURCE)))
    })
}

pub(crate) fn circuit() -> &'static Circuit {
    program().circuit.unwrap_register_ref()
}

/// Number of AND gates, the cost driver of the MPC.
pub fn and_gates() -> usize {
    circuit().and_ops
}

/// Runs the circuit in the clear on all three parties' shares, with zero output masks.
/// For tests and debugging only: whoever calls this sees every order and balance.
pub fn eval_in_clear(
    orders: &[io::OrderShares; 3],
    accounts: &[io::AccountShares; 3],
) -> Result<io::Outcome, Error> {
    let zero = io::Outcome {
        fills: [[0; zpredict_core::FILL_LEN]; N],
        balances: [[0; zpredict_core::BALANCE_LEN]; ACCOUNTS],
    };
    let inputs = (0..3)
        .map(|p| io::input_bits(p, &orders[p], &accounts[p], &zero))
        .collect::<Result<Vec<_>, _>>()?;
    io::decode_output(&circuit().eval(&inputs))
}
