use std::fmt;

/// Everything that can go wrong between a PCZT and a FROST signature.
#[derive(Debug)]
pub enum Error {
    /// The FROST group key is not a valid Orchard spend validating key.
    InvalidAk,
    /// A network name other than `main`, `test` or `regtest`.
    UnknownNetwork(String),
    /// Key or address encoding failed.
    Encoding(String),
    /// The PCZT bytes could not be parsed or serialized.
    Pczt(String),
    /// The PCZT lacks data needed to compute the sighash, or is pre-v5.
    Sighash(String),
    /// A signature did not fit its action, or failed verification against `rk`.
    Signature(String),
    /// A malformed command-line argument.
    Usage(String),
    /// A sealed secret could not be opened, or the store key is missing.
    Store(String),
    /// The chain backend (lightwalletd) failed.
    Chain(String),
    /// A payout could not be parsed or its PCZT could not be built.
    Payout(String),
    /// A signer refused: the PCZT does not match the agreed payout vector.
    Refused(String),
    /// A FROST key share or signing step failed.
    Frost(String),
    Io(std::io::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::InvalidAk => write!(f, "ak is not a valid spend validating key"),
            Error::UnknownNetwork(n) => write!(f, "unknown network {n:?}"),
            Error::Encoding(e) => write!(f, "encoding: {e}"),
            Error::Pczt(e) => write!(f, "PCZT: {e}"),
            Error::Sighash(e) => write!(f, "sighash: {e}"),
            Error::Signature(e) => write!(f, "signature: {e}"),
            Error::Usage(e) => write!(f, "{e}"),
            Error::Store(e) => write!(f, "store: {e}"),
            Error::Chain(e) => write!(f, "chain: {e}"),
            Error::Payout(e) => write!(f, "payout: {e}"),
            Error::Refused(e) => write!(f, "refused to sign: {e}"),
            Error::Frost(e) => write!(f, "frost: {e}"),
            Error::Io(e) => write!(f, "io: {e}"),
        }
    }
}

impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::Io(e)
    }
}

pub type Result<T> = std::result::Result<T, Error>;
