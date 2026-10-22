//! The crate's error type.

use std::fmt;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug)]
pub enum Error {
    /// Transport failure talking to the node.
    Http(reqwest::Error),
    /// The node answered a call with a gRPC error status.
    Grpc {
        method: &'static str,
        status: String,
    },
    /// The node's reply is missing data or cannot be decoded.
    BadReply(String),
    /// The market's params do not fit its plugin.
    Params(serde_json::Error),
    /// No resolver is registered under this plugin name.
    UnknownPlugin(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Http(e) => write!(f, "node request failed: {e}"),
            Error::Grpc { method, status } => write!(f, "{method}: gRPC error {status}"),
            Error::BadReply(msg) => write!(f, "bad node reply: {msg}"),
            Error::Params(e) => write!(f, "invalid market params: {e}"),
            Error::UnknownPlugin(name) => write!(f, "unknown plugin {name:?}"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::Http(e) => Some(e),
            Error::Params(e) => Some(e),
            _ => None,
        }
    }
}

impl From<reqwest::Error> for Error {
    fn from(e: reqwest::Error) -> Self {
        Error::Http(e)
    }
}

impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Error::Params(e)
    }
}

impl From<prost::DecodeError> for Error {
    fn from(e: prost::DecodeError) -> Self {
        Error::BadReply(e.to_string())
    }
}
