//! The market record served by the relayer API (`GET /markets`, DESIGN.md).

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::{Evidence, Outcome, Resolution, Result};

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
    /// For an outside-oracle outcome instead of a block: the oracle (`"polymarket"`) and
    /// its market's id there (see [`Evidence::Source`]).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub condition_id: Option<String>,
    /// Made by the relayer's rolling-market generator, not listed in its config.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub rolling: bool,
    /// Display only, from the config; never part of what is signed.
    #[serde(flatten)]
    pub info: Info,
}

/// Presentation fields a market's config may carry. None of them changes how the market
/// trades or resolves, so they are not part of its terms (`markets/saved.rs`).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    /// e.g. "Zcash network", "Rolling", "Politics".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    /// Groups binary markets shown as one multi-outcome event (one row per market).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event: Option<Event>,
    /// When trading opened, RFC 3339.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opens_at: Option<String>,
    /// Plain-text resolution rules for the market page.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rules: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Event {
    pub id: String,
    pub title: String,
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
        (
            self.block_hash,
            self.block_height,
            self.source,
            self.condition_id,
        ) = match &r.evidence {
            Evidence::Block { height, block_hash } => {
                (Some(block_hash.clone()), Some(*height), None, None)
            }
            Evidence::Source {
                source,
                condition_id,
            } => (None, None, Some(source.clone()), Some(condition_id.clone())),
        };
    }

    /// The published resolution, rebuilt from the market's fields.
    pub fn resolution(&self) -> Option<Resolution> {
        let evidence = match (&self.source, &self.condition_id) {
            (Some(source), Some(condition_id)) => Evidence::Source {
                source: source.clone(),
                condition_id: condition_id.clone(),
            },
            _ => Evidence::Block {
                height: self.block_height?,
                block_hash: self.block_hash.clone()?,
            },
        };
        Some(Resolution {
            market: self.id,
            outcome: self.outcome?,
            evidence,
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
            evidence: Evidence::Block {
                height: 100,
                block_hash: "ab".into(),
            },
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
        assert_eq!((m.status, m.outcome_sig.take()), (Status::Resolved, None));
        let polymarket = Resolution::from_source(&m, "polymarket", "0x01", true);
        m.set_resolution(&polymarket);
        assert_eq!((m.resolution(), m.block_hash), (Some(polymarket), None));
    }

    #[test]
    fn display_info_is_optional_and_flat() {
        let json = r#"{"id":7,"question":"q?","plugin":"yes","params":{},"closeHeight":90,"resolveHeight":100,"status":"open","category":"Politics","event":{"id":"house-2026","title":"Which party?"},"rules":"r"}"#;
        let m: Market = serde_json::from_str(json).unwrap();
        assert_eq!(m.info.event.as_ref().unwrap().id, "house-2026");
        assert_eq!(serde_json::to_string(&m).unwrap(), json);
    }
}
