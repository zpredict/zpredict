//! Market outcomes and the signed resolution record.

use serde::{Deserialize, Serialize};

use crate::{Block, Market};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Yes,
    No,
}

impl From<bool> for Outcome {
    fn from(yes: bool) -> Self {
        if yes { Outcome::Yes } else { Outcome::No }
    }
}

/// Domain separation for outcome signatures.
pub const MESSAGE_PREFIX: &[u8] = b"zPredict outcome v1\n";

/// An outcome plus what it was computed from, so anyone can recompute it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Resolution {
    pub market: u32,
    pub outcome: Outcome,
    #[serde(flatten)]
    pub evidence: Evidence,
}

/// What backs an outcome. The two forms have disjoint JSON keys, so a signed message
/// names its own kind and one can never be read as the other.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Evidence {
    /// Zcash chain data: the block (display-order hex hash) the rule was evaluated on.
    #[serde(rename_all = "camelCase")]
    Block { height: u32, block_hash: String },
    /// An outside oracle's published result, e.g. `source: "polymarket"` and the market's
    /// `conditionId` there.
    #[serde(rename_all = "camelCase")]
    Source {
        source: String,
        condition_id: String,
    },
}

impl Resolution {
    pub fn new(market: &Market, block: Block, yes: bool) -> Self {
        Self {
            market: market.id,
            outcome: yes.into(),
            evidence: Evidence::Block {
                height: block.height,
                block_hash: block.hash,
            },
        }
    }

    /// An outcome taken from an outside oracle (`source`) for its market `condition_id`.
    pub fn from_source(market: &Market, source: &str, condition_id: &str, yes: bool) -> Self {
        Self {
            market: market.id,
            outcome: yes.into(),
            evidence: Evidence::Source {
                source: source.into(),
                condition_id: condition_id.into(),
            },
        }
    }

    /// Height and hash of the block behind a chain-data outcome.
    pub fn block(&self) -> Option<(u32, &str)> {
        match &self.evidence {
            Evidence::Block { height, block_hash } => Some((*height, block_hash)),
            Evidence::Source { .. } => None,
        }
    }

    /// The bytes the relayers FROST-sign into `Market::outcome_sig`: [`MESSAGE_PREFIX`]
    /// then the compact JSON, in this field order:
    /// - chain data: `{"market":7,"outcome":"yes","height":100,"blockHash":"00ab…"}`
    /// - outside oracle: `{"market":7,"outcome":"yes","source":"polymarket","conditionId":"0x…"}`
    ///
    /// The chain form is byte-for-byte what it was before the second form existed.
    /// `@zpredict/sdk` rebuilds the same bytes to verify.
    pub fn message(&self) -> Vec<u8> {
        let json = serde_json::to_vec(self).expect("plain struct serializes");
        [MESSAGE_PREFIX, &json].concat()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_message_forms_and_round_trip() {
        let block = Resolution {
            market: 7,
            outcome: Outcome::Yes,
            evidence: Evidence::Block {
                height: 100,
                block_hash: "00ab".into(),
            },
        };
        let source = Resolution {
            market: 7,
            outcome: Outcome::No,
            evidence: Evidence::Source {
                source: "polymarket".into(),
                condition_id: "0x01".into(),
            },
        };
        let text = |r: &Resolution| String::from_utf8(r.message()).unwrap();
        assert_eq!(
            text(&block),
            "zPredict outcome v1\n{\"market\":7,\"outcome\":\"yes\",\"height\":100,\"blockHash\":\"00ab\"}"
        );
        assert_eq!(
            text(&source),
            "zPredict outcome v1\n{\"market\":7,\"outcome\":\"no\",\"source\":\"polymarket\",\"conditionId\":\"0x01\"}"
        );
        for r in [block, source] {
            let back: Resolution =
                serde_json::from_slice(&r.message()[MESSAGE_PREFIX.len()..]).unwrap();
            assert_eq!(back, r);
        }
    }
}
