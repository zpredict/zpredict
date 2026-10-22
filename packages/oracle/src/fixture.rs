//! In-memory [`Chain`] for tests.

use crate::{Block, Chain, Error, Result};

#[derive(Default)]
pub struct FixtureChain {
    pub tip: u32,
    pub blocks: Vec<Block>,
}

impl Chain for FixtureChain {
    fn tip(&self) -> Result<u32> {
        Ok(self.tip)
    }

    fn block(&self, height: u32) -> Result<Option<Block>> {
        if height > self.tip {
            return Ok(None);
        }
        let block = self.blocks.iter().find(|b| b.height == height).cloned();
        let block =
            block.ok_or_else(|| Error::BadReply(format!("fixture has no block {height}")))?;
        Ok(Some(block))
    }
}
