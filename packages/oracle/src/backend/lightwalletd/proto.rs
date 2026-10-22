//! Hand-written prost messages mirroring `walletrpc/{service,compact_formats}.proto`
//! of zcash/lightwallet-protocol. Only the fields we read are declared; prost
//! skips the rest. Field tags must match the upstream `.proto` files.

use prost::Message;

#[derive(Clone, PartialEq, Message)]
pub struct ChainSpec {}

#[derive(Clone, PartialEq, Message)]
pub struct BlockId {
    #[prost(uint64, tag = "1")]
    pub height: u64,
    #[prost(bytes = "vec", tag = "2")]
    pub hash: Vec<u8>,
}

#[derive(Clone, PartialEq, Message)]
pub struct TxFilter {
    #[prost(message, optional, tag = "1")]
    pub block: Option<BlockId>,
    #[prost(uint64, tag = "2")]
    pub index: u64,
    #[prost(bytes = "vec", tag = "3")]
    pub hash: Vec<u8>,
}

#[derive(Clone, PartialEq, Message)]
pub struct RawTransaction {
    #[prost(bytes = "vec", tag = "1")]
    pub data: Vec<u8>,
}

#[derive(Clone, PartialEq, Message)]
pub struct CompactBlock {
    #[prost(uint64, tag = "2")]
    pub height: u64,
    #[prost(bytes = "vec", tag = "3")]
    pub hash: Vec<u8>,
    #[prost(message, repeated, tag = "7")]
    pub vtx: Vec<CompactTx>,
    #[prost(message, optional, tag = "8")]
    pub chain_metadata: Option<ChainMetadata>,
}

/// Spends, outputs and actions are only counted, so they are kept as raw
/// bytes: a nested message and `bytes` share the same wire encoding.
#[derive(Clone, PartialEq, Message)]
pub struct CompactTx {
    #[prost(uint64, tag = "1")]
    pub index: u64,
    #[prost(bytes = "vec", tag = "2")]
    pub txid: Vec<u8>,
    #[prost(bytes = "vec", repeated, tag = "4")]
    pub spends: Vec<Vec<u8>>,
    #[prost(bytes = "vec", repeated, tag = "5")]
    pub outputs: Vec<Vec<u8>>,
    #[prost(bytes = "vec", repeated, tag = "6")]
    pub actions: Vec<Vec<u8>>,
    #[prost(bytes = "vec", repeated, tag = "9")]
    pub ironwood_actions: Vec<Vec<u8>>,
}

#[derive(Clone, PartialEq, Message)]
pub struct ChainMetadata {
    #[prost(uint32, tag = "3")]
    pub ironwood_commitment_tree_size: u32,
}
