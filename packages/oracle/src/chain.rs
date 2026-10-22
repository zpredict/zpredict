//! Node access: the [`Chain`] trait and the block data plugins read.

use crate::Result;

/// Blocks that must sit on top of a height before it is used for resolution,
/// so a shallow reorg cannot flip a published outcome.
pub const CONFIRMATIONS: u32 = 10;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Block {
    pub height: u32,
    /// Byte-reversed hex, as block explorers show it.
    pub hash: String,
    /// Consensus branch ID from the coinbase transaction header.
    pub branch_id: u32,
    /// Sapling spends + Sapling outputs + Orchard actions + Ironwood actions.
    pub shielded_actions: u32,
    /// Size of the Ironwood note commitment tree at the end of this block.
    pub ironwood_notes: u32,
}

/// A view of the chain. `block` returns `None` for heights above the tip.
pub trait Chain {
    fn tip(&self) -> Result<u32>;
    fn block(&self, height: u32) -> Result<Option<Block>>;
}

/// The block at `height` once it has [`CONFIRMATIONS`]; `None` before that.
pub fn confirmed_block(chain: &dyn Chain, height: u32) -> Result<Option<Block>> {
    if chain.tip()? < height.saturating_add(CONFIRMATIONS) {
        return Ok(None);
    }
    chain.block(height)
}
