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

    /// The bytes the relayers FROST-sign into `Market::outcome_sig`:
    /// [`MESSAGE_PREFIX`] then the compact JSON
    /// `{"market":7,"outcome":"yes","height":100,"blockHash":"00ab…"}` (this field order).
    /// `@zpredict/sdk` rebuilds the same bytes to verify.
    pub fn message(&self) -> Vec<u8> {
        let json = serde_json::to_vec(self).expect("plain struct serializes");
        [MESSAGE_PREFIX, &json].concat()
    }
}
