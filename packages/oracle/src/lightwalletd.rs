//! [`Chain`] over the lightwalletd / Zaino gRPC API (`CompactTxStreamer`).
//!
//! Why gRPC and not Zebra JSON-RPC: public endpoints (`zec.rocks:443`,
//! `testnet.zec.rocks:443`) only expose lightwalletd; there is no keyless public
//! Zebra RPC. gRPC is plain HTTP/2 with a 5-byte frame prefix, so this uses
//! reqwest + prost with hand-written messages: no protoc, no tonic.
//! Messages mirror `walletrpc/{service,compact_formats}.proto` of
//! zcash/lightwallet-protocol, keeping only the fields we read.

use std::time::Duration;

use prost::Message;

use crate::{Block, Chain, Result};

pub struct Lightwalletd {
    url: String,
    http: reqwest::blocking::Client,
}

impl Lightwalletd {
    /// `url` like `https://zec.rocks:443`.
    pub fn new(url: &str) -> Result<Self> {
        let http = reqwest::blocking::Client::builder()
            .http2_prior_knowledge()
            .timeout(Duration::from_secs(30))
            .build()?;
        Ok(Self {
            url: url.trim_end_matches('/').to_owned(),
            http,
        })
    }

    fn call<Req: Message, Resp: Message + Default>(&self, method: &str, req: &Req) -> Result<Resp> {
        let len = u32::try_from(req.encoded_len())?;
        let mut body = vec![0u8]; // uncompressed
        body.extend_from_slice(&len.to_be_bytes());
        req.encode(&mut body)?;
        let url = format!(
            "{}/cash.z.wallet.sdk.rpc.CompactTxStreamer/{method}",
            self.url
        );
        let resp = self
            .http
            .post(url)
            .header("content-type", "application/grpc")
            .header("te", "trailers")
            .body(body)
            .send()?
            .error_for_status()?;
        // Errors arrive as a trailers-only response, i.e. in the headers.
        if let Some(status) = resp.headers().get("grpc-status").filter(|s| *s != "0") {
            let msg = resp.headers().get("grpc-message");
            return Err(format!("{method}: grpc-status {status:?} {msg:?}").into());
        }
        let bytes = resp.bytes()?;
        match bytes.first() {
            Some(0) => Ok(Resp::decode(&bytes[5..])?),
            _ => Err(format!("{method}: empty or compressed gRPC response").into()),
        }
    }
}

impl Chain for Lightwalletd {
    fn tip(&self) -> Result<u32> {
        let id: BlockId = self.call("GetLatestBlock", &ChainSpec {})?;
        Ok(u32::try_from(id.height)?)
    }

    fn block(&self, height: u32) -> Result<Option<Block>> {
        if height > self.tip()? {
            return Ok(None);
        }
        let id = BlockId {
            height: height.into(),
            hash: vec![],
        };
        let b: CompactBlock = self.call("GetBlock", &id)?;
        // GetTransaction only looks up by txid, so take the coinbase's from the block.
        let coinbase = b
            .vtx
            .iter()
            .find(|t| t.index == 0)
            .ok_or("block has no coinbase")?;
        let filter = TxFilter {
            block: None,
            index: 0,
            hash: coinbase.txid.clone(),
        };
        let raw: RawTransaction = self.call("GetTransaction", &filter)?;
        let actions: usize = b
            .vtx
            .iter()
            .map(|t| t.spends.len() + t.outputs.len() + t.actions.len() + t.ironwood_actions.len())
            .sum();
        Ok(Some(Block {
            height: u32::try_from(b.height)?,
            hash: b.hash.iter().rev().map(|x| format!("{x:02x}")).collect(),
            branch_id: branch_id(&raw.data)?,
            shielded_actions: u32::try_from(actions)?,
            ironwood_notes: b
                .chain_metadata
                .map_or(0, |m| m.ironwood_commitment_tree_size),
        }))
    }
}

/// Consensus branch ID from a raw transaction: v5+ headers carry it at bytes
/// 8..12 (header, nVersionGroupId, nConsensusBranchId); older versions have none.
fn branch_id(tx: &[u8]) -> Result<u32> {
    let word = |i: usize| -> Result<u32> {
        let b = tx.get(i..i + 4).ok_or("transaction too short")?;
        Ok(u32::from_le_bytes(b.try_into()?))
    };
    Ok(if word(0)? & 0x7fff_ffff >= 5 {
        word(8)?
    } else {
        0
    })
}

#[derive(Clone, PartialEq, Message)]
struct ChainSpec {}

#[derive(Clone, PartialEq, Message)]
struct BlockId {
    #[prost(uint64, tag = "1")]
    height: u64,
    #[prost(bytes = "vec", tag = "2")]
    hash: Vec<u8>,
}

#[derive(Clone, PartialEq, Message)]
struct TxFilter {
    #[prost(message, optional, tag = "1")]
    block: Option<BlockId>,
    #[prost(uint64, tag = "2")]
    index: u64,
    #[prost(bytes = "vec", tag = "3")]
    hash: Vec<u8>,
}

#[derive(Clone, PartialEq, Message)]
struct RawTransaction {
    #[prost(bytes = "vec", tag = "1")]
    data: Vec<u8>,
}

#[derive(Clone, PartialEq, Message)]
struct CompactBlock {
    #[prost(uint64, tag = "2")]
    height: u64,
    #[prost(bytes = "vec", tag = "3")]
    hash: Vec<u8>,
    #[prost(message, repeated, tag = "7")]
    vtx: Vec<CompactTx>,
    #[prost(message, optional, tag = "8")]
    chain_metadata: Option<ChainMetadata>,
}

/// Spends, outputs and actions are only counted, so they are kept as raw
/// bytes: a nested message and `bytes` share the same wire encoding.
#[derive(Clone, PartialEq, Message)]
struct CompactTx {
    #[prost(uint64, tag = "1")]
    index: u64,
    #[prost(bytes = "vec", tag = "2")]
    txid: Vec<u8>,
    #[prost(bytes = "vec", repeated, tag = "4")]
    spends: Vec<Vec<u8>>,
    #[prost(bytes = "vec", repeated, tag = "5")]
    outputs: Vec<Vec<u8>>,
    #[prost(bytes = "vec", repeated, tag = "6")]
    actions: Vec<Vec<u8>>,
    #[prost(bytes = "vec", repeated, tag = "9")]
    ironwood_actions: Vec<Vec<u8>>,
}

#[derive(Clone, PartialEq, Message)]
struct ChainMetadata {
    #[prost(uint32, tag = "3")]
    ironwood_commitment_tree_size: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn branch_id_from_header() {
        // v5 header (0x80000005), NU5 version group, NU6 branch 0xc8e71055.
        assert_eq!(
            branch_id(&hex("050000800a27a7265510e7c8")).unwrap(),
            0xc8e7_1055
        );
        // v4 Sapling transaction: no branch ID in the header.
        assert_eq!(branch_id(&hex("0400008085202f89bb09b876")).unwrap(), 0);
        assert!(branch_id(&[5, 0, 0, 0x80]).is_err());
    }

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }
}
