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

/// An outcome plus the exact block it was computed from, so anyone can
/// recompute it against their own node.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolution {
    pub market: u32,
    pub outcome: Outcome,
    pub height: u32,
    /// Block hash in the usual display order (byte-reversed hex).
    pub block_hash: String,
}

impl Resolution {
    pub fn new(market: &Market, block: Block, yes: bool) -> Self {
        Self {
            market: market.id,
            outcome: yes.into(),
            height: block.height,
            block_hash: block.hash,
        }
    }

    /// The bytes the relayers sign.
    // TODO(settle): FROST 2-of-3 signs these bytes; the signature goes into
    // `Market::outcome_sig`. Until the settle crate lands, outcomes are unsigned.
    pub fn message(&self) -> Vec<u8> {
        serde_json::to_vec(self).expect("plain struct serializes")
    }
}
