//! The market record served by the relayer API (`GET /markets`, DESIGN.md).

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::{Outcome, Result};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Market {
    pub id: u32,
    pub question: String,
    /// Name of the resolver plugin, e.g. `nu7-activation`.
    pub plugin: String,
    /// Plugin-specific parameters, parsed with [`Market::params`].
    pub params: serde_json::Value,
    pub close_height: u32,
    pub resolve_height: u32,
    pub status: Status,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome: Option<Outcome>,
    /// Hex FROST signature over [`crate::Resolution::message`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome_sig: Option<String>,
}

impl Market {
    /// Deserializes this market's plugin parameters.
    pub fn params<T: DeserializeOwned>(&self) -> Result<T> {
        Ok(serde_json::from_value(self.params.clone())?)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Open,
    Closed,
    Resolved,
}

#[cfg(test)]
mod tests {
    use super::*;

    const JSON: &str = r#"{"id":7,"question":"q?","plugin":"yes","params":{},"closeHeight":90,"resolveHeight":100,"status":"open"}"#;

    #[test]
    fn json_round_trips() {
        let m: Market = serde_json::from_str(JSON).unwrap();
        assert_eq!(m.status, Status::Open);
        assert_eq!(serde_json::to_string(&m).unwrap(), JSON);
    }
}
