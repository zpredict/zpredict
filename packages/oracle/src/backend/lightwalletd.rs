//! [`Chain`] over the lightwalletd / Zaino gRPC API (`CompactTxStreamer`).
//!
//! Why gRPC and not Zebra JSON-RPC: public endpoints (`zec.rocks:443`,
//! `testnet.zec.rocks:443`) only expose lightwalletd; there is no keyless public
//! Zebra RPC. gRPC is plain HTTP/2 with a 5-byte frame prefix, so this uses
//! reqwest + prost with hand-written messages ([`proto`]): no protoc, no tonic.

mod proto;

use std::time::Duration;

use prost::Message;

use self::proto::{BlockId, ChainSpec, CompactBlock, RawTransaction, TxFilter};
use crate::{Block, Chain, Error, Result};

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

    /// One unary gRPC call: a 5-byte frame header (compressed flag, length)
    /// followed by the protobuf message, both ways.
    fn call<Req: Message, Resp: Message + Default>(
        &self,
        method: &'static str,
        req: &Req,
    ) -> Result<Resp> {
        let msg = req.encode_to_vec();
        let len = u32::try_from(msg.len()).expect("request messages are tiny");
        let mut body = vec![0u8]; // uncompressed
        body.extend_from_slice(&len.to_be_bytes());
        body.extend_from_slice(&msg);
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
            let status = format!("{status:?} {msg:?}");
            return Err(Error::Grpc { method, status });
        }
        let bytes = resp.bytes()?;
        match bytes.split_at_checked(5) {
            Some((head, msg)) if head[0] == 0 => Ok(Resp::decode(msg)?),
            _ => Err(Error::BadReply(format!(
                "{method}: empty or compressed gRPC response"
            ))),
        }
    }
}

impl Chain for Lightwalletd {
    fn tip(&self) -> Result<u32> {
        let id: BlockId = self.call("GetLatestBlock", &ChainSpec {})?;
        to_u32(id.height, "tip height")
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
            .ok_or_else(|| Error::BadReply(format!("block {height} has no coinbase")))?;
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
            height: to_u32(b.height, "block height")?,
            hash: b.hash.iter().rev().map(|x| format!("{x:02x}")).collect(),
            branch_id: branch_id(&raw.data)?,
            shielded_actions: to_u32(actions, "action count")?,
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
        let b = tx.get(i..i + 4).and_then(|b| b.try_into().ok());
        let b = b.ok_or_else(|| Error::BadReply("transaction too short".into()))?;
        Ok(u32::from_le_bytes(b))
    };
    Ok(if word(0)? & 0x7fff_ffff >= 5 {
        word(8)?
    } else {
        0
    })
}

fn to_u32(v: impl TryInto<u32>, what: &str) -> Result<u32> {
    v.try_into()
        .map_err(|_| Error::BadReply(format!("{what} overflows u32")))
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
