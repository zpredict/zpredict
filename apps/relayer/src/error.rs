//! The crate's error type.

use std::fmt;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug)]
pub enum Error {
    Config(String),
    Io(std::io::Error),
    /// The event log has a corrupt entry (not just a torn last line).
    Store(String),
    /// A peer link failed or a peer broke the batch protocol.
    Peer(String),
    /// The MPC run aborted; the batch is retried next window.
    Mpc(String),
    /// Escrow scanning, payout building or signing failed.
    Settle(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Config(m) => write!(f, "config: {m}"),
            Error::Io(e) => write!(f, "io: {e}"),
            Error::Store(m) => write!(f, "store: {m}"),
            Error::Peer(m) => write!(f, "peer: {m}"),
            Error::Mpc(m) => write!(f, "mpc: {m}"),
            Error::Settle(m) => write!(f, "settle: {m}"),
        }
    }
}

impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::Io(e)
    }
}

impl From<snow::Error> for Error {
    fn from(e: snow::Error) -> Self {
        Error::Peer(e.to_string())
    }
}

impl From<zpredict_settle::Error> for Error {
    fn from(e: zpredict_settle::Error) -> Self {
        Error::Settle(e.to_string())
    }
}

impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Error::Peer(e.to_string())
    }
}
