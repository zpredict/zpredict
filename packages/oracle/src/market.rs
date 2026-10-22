//! The market record served by the relayer API (`GET /markets`, DESIGN.md).

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::{Outcome, Resolution, Result};

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
    /// Hex FROST 2-of-3 signature over [`Resolution::message`], once the relayers agree.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome_sig: Option<String>,
    /// The block the outcome was computed from (display-order hex) and its height.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub block_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub block_height: Option<u32>,
    /// Made by the relayer's rolling-market generator, not listed in its config.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub rolling: bool,
}

impl Market {
    /// Deserializes this market's plugin parameters.
    pub fn params<T: DeserializeOwned>(&self) -> Result<T> {
        Ok(serde_json::from_value(self.params.clone())?)
    }

    /// Marks the market resolved with `r`; a different resolution drops any signature.
    pub fn set_resolution(&mut self, r: &Resolution) {
        if self.resolution().as_ref() != Some(r) {
            self.outcome_sig = None;
        }
        self.status = Status::Resolved;
        self.outcome = Some(r.outcome);
        self.block_hash = Some(r.block_hash.clone());
        self.block_height = Some(r.height);
    }

    /// The published resolution, rebuilt from the market's fields.
    pub fn resolution(&self) -> Option<Resolution> {
        Some(Resolution {
            market: self.id,
            outcome: self.outcome?,
            height: self.block_height?,
            block_hash: self.block_hash.clone()?,
        })
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

    #[test]
    fn resolution_round_trips_and_a_new_one_drops_the_signature() {
        let mut m: Market = serde_json::from_str(JSON).unwrap();
        assert_eq!(m.resolution(), None);
        let r = Resolution {
            market: 7,
            outcome: Outcome::Yes,
            height: 100,
            block_hash: "ab".into(),
        };
        m.set_resolution(&r);
        m.outcome_sig = Some("00".into());
        m.set_resolution(&r);
        assert_eq!(
            (m.resolution(), m.outcome_sig.is_some()),
            (Some(r.clone()), true)
        );
        m.set_resolution(&Resolution {
            outcome: Outcome::No,
            ..r
        });
        assert_eq!((m.status, m.outcome_sig), (Status::Resolved, None));
    }
}
