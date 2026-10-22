use std::sync::OnceLock;

use polytune::garble_lang::{
    CircuitKind, CompileOptions, GarbleProgram, compile_with_options, register_circuit::Circuit,
};

use crate::{Error, io};

/// Orders per batch; the Garble source hard-codes the same number.
pub const N: usize = 16;

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
/// For tests and debugging only: whoever calls this sees every order.
pub fn eval_in_clear(shares: &[io::OrderShares; 3]) -> Result<io::FillShares, Error> {
    let zero = [[0u8; zpredict_core::FILL_LEN]; N];
    let inputs = (0..3)
        .map(|p| io::input_bits(p, &shares[p], &zero))
        .collect::<Result<Vec<_>, _>>()?;
    io::decode_output(&circuit().eval(&inputs))
}
