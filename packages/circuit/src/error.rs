/// Everything that can stop one party's run.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The MPC protocol failed: a peer aborted, cheated, or the channel broke.
    #[error("mpc: {0}")]
    Mpc(#[from] polytune::Error),
    /// Connecting to or talking with a peer failed.
    #[error("network: {0}")]
    Io(#[from] std::io::Error),
    /// Inputs or outputs did not match the circuit's types.
    #[error("circuit io: {0}")]
    Circuit(String),
}
