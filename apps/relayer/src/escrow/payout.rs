//! Paying debited withdrawals out of the escrow: one batched Ironwood transaction to
//! every requested address, FROST-signed 2-of-3 over the Noise peer links.
//!
//! All three relayers recorded the same debited withdrawals (the batch's public
//! `withdrawn` bits), so all three know the payout vector without being told. Relayer 0
//! builds the PCZT from the escrow wallet and proves it in the background; relayers 0
//! and 1 each run verify-then-sign against their own copy of the payout vector, so
//! neither takes the other's word for any output; relayer 0 aggregates, combines and
//! broadcasts, then tells both peers the txid (or why it failed). Relayer 2 only waits.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use zpredict_settle::redpallas::{
    Identifier, SigningPackage, round1::SigningCommitments, round2::SignatureShare,
};
use zpredict_settle::{Payout, Pczt, frost, randomizers};

use super::Escrow;
use crate::error::{Error, Result};
use crate::ledger::WithdrawalStatus;
use crate::peers::Links;
use crate::state::Shared;
use crate::store::Event;

/// The co-signer. Any two of three can sign; relayer 0 always does (it proves).
const SIGNER: usize = 1;

#[derive(Serialize, Deserialize)]
enum Msg {
    Pczt(String),
    Commitments { id: String, list: Vec<String> },
    Packages(Vec<String>),
    Shares(Vec<String>),
    Done(String),
    Failed(String),
}

/// Runs the payout round if any debited withdrawal is unpaid; every relayer calls it
/// after its batch.
pub async fn round(e: &Escrow, state: &Shared, links: &Links) -> Result<()> {
    let (ids, payouts) = {
        let s = state.lock().expect("state lock");
        let debited = s.ledger.debited();
        let ids: Vec<String> = debited.iter().map(|(id, _)| (*id).clone()).collect();
        let payouts = debited
            .iter()
            .map(|(_, w)| Payout::parse(&e.params, &w.address, w.zats()))
            .collect::<std::result::Result<Vec<_>, _>>()?;
        (ids, payouts)
    };
    if ids.is_empty() {
        return Ok(());
    }
    let txid = match links.party {
        0 => {
            let result = coordinate(e, state, links, &ids, &payouts).await;
            let msg = match &result {
                Ok(txid) => Msg::Done(txid.clone()),
                Err(err) => Msg::Failed(err.to_string()),
            };
            for p in 1..3 {
                send(links, p, &msg).await?;
            }
            result?
        }
        p => {
            if p == SIGNER {
                cosign(e, links, &payouts).await?
            } else {
                outcome(links).await?
            }
        }
    };
    let status = WithdrawalStatus::Paid;
    let event = Event::Payout {
        ids,
        status,
        txid: Some(txid),
    };
    state.lock().expect("state lock").record(event)
}

/// Relayer 0: build, prove, sign with relayer 1, broadcast.
async fn coordinate(
    e: &Escrow,
    state: &Shared,
    links: &Links,
    ids: &[String],
    payouts: &[Payout],
) -> Result<String> {
    let tool = e
        .devtool
        .as_ref()
        .ok_or_else(|| Error::Config("no devtool".into()))?;
    // The sidecar opens the wallet fresh on every deploy: bring it to the tip first, or
    // the proposal fails with "Must scan blocks first".
    blocking({
        let tool = tool.clone();
        move || tool.sync()
    })
    .await?;
    let (params, wallet, list) = (e.params, tool.wallet.clone(), payouts.to_vec());
    let pczt =
        blocking(move || Ok(zpredict_settle::payout::create(&params, &wallet, &list)?)).await?;
    let bytes = serialize(&pczt)?;
    let to_prove = bytes.clone();
    let prover = tokio::task::spawn_blocking({
        let tool = tool.clone();
        move || tool.prove(&to_prove)
    });

    let spends = randomizers(&pczt)?.len();
    let (nonces, ours) = frost::commit(&e.share, spends);
    send(links, SIGNER, &Msg::Pczt(hex::encode(&bytes))).await?;
    let Msg::Commitments { id, list } = recv(links, SIGNER).await? else {
        return Err(Error::Peer("expected commitments".into()));
    };
    let theirs: Vec<SigningCommitments> = decode_all(&list, SigningCommitments::deserialize)?;
    let peer = Identifier::deserialize(&unhex(&id)?).map_err(settle_err)?;
    let commitments = BTreeMap::from([(e.share.id(), ours), (peer, theirs)]);
    let requests = frost::requests(&pczt, &commitments)?;
    let packages = (requests.iter())
        .map(|r| r.package.serialize().map(hex::encode).map_err(settle_err))
        .collect::<Result<_>>()?;
    send(links, SIGNER, &Msg::Packages(packages)).await?;
    let shares = match recv(links, SIGNER).await? {
        Msg::Shares(s) => decode_all(&s, SignatureShare::deserialize)?,
        Msg::Failed(why) => return Err(Error::Settle(format!("relayer {SIGNER}: {why}"))),
        _ => return Err(Error::Peer("expected signature shares".into())),
    };
    let mine = frost::verify_then_sign(&e.share, &nonces, &pczt, payouts, &e.fvk, &requests)?;
    let all = BTreeMap::from([(e.share.id(), mine), (peer, shares)]);
    let sigs = frost::aggregate(&e.share.group, &requests, &all)?;
    let signed = serialize(&zpredict_settle::apply(pczt, &sigs)?)?;
    let proven = prover.await.map_err(|e| Error::Settle(e.to_string()))??;

    // From here a broadcast may happen: record it first, so a crash never pays twice.
    let paying = Event::Payout {
        ids: ids.to_vec(),
        status: WithdrawalStatus::Paying,
        txid: None,
    };
    state.lock().expect("state lock").record(paying)?;
    let tool = tool.clone();
    blocking(move || tool.send(&tool.combine(&signed, &proven)?)).await
}

/// Relayer 1: commit, then sign only what its own payout vector says.
async fn cosign(e: &Escrow, links: &Links, payouts: &[Payout]) -> Result<String> {
    let Msg::Pczt(hex) = recv(links, 0).await? else {
        return outcome(links).await;
    };
    let pczt = Pczt::parse(&unhex(&hex)?).map_err(|e| Error::Settle(format!("{e:?}")))?;
    let (nonces, commitments) = frost::commit(&e.share, randomizers(&pczt)?.len());
    let list = (commitments.iter())
        .map(|c| c.serialize().map(hex::encode).map_err(settle_err))
        .collect::<Result<_>>()?;
    let id = hex::encode(e.share.id().serialize());
    send(links, 0, &Msg::Commitments { id, list }).await?;
    let Msg::Packages(packages) = recv(links, 0).await? else {
        return outcome(links).await;
    };
    let packages = decode_all(&packages, SigningPackage::deserialize)?;
    let reply = match frost::sign_packages(&e.share, &nonces, &pczt, payouts, &e.fvk, packages) {
        Ok(shares) => Msg::Shares(shares.iter().map(|s| hex::encode(s.serialize())).collect()),
        Err(err) => Msg::Failed(err.to_string()),
    };
    send(links, 0, &reply).await?;
    outcome(links).await
}

/// Relayer 0's last word: the txid, or why the payout failed.
async fn outcome(links: &Links) -> Result<String> {
    match recv(links, 0).await? {
        Msg::Done(txid) => Ok(txid),
        Msg::Failed(why) => Err(Error::Settle(format!("payout failed: {why}"))),
        _ => Err(Error::Peer("unexpected payout message".into())),
    }
}

async fn send(links: &Links, p: usize, m: &Msg) -> Result<()> {
    links.send(p, &serde_json::to_vec(m)?).await
}

async fn recv(links: &Links, p: usize) -> Result<Msg> {
    Ok(serde_json::from_slice(&links.recv(p).await?)?)
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T> + Send + 'static) -> Result<T> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| Error::Settle(e.to_string()))?
}

fn serialize(p: &Pczt) -> Result<Vec<u8>> {
    p.clone()
        .serialize()
        .map_err(|e| Error::Settle(format!("{e:?}")))
}

fn unhex(h: &str) -> Result<Vec<u8>> {
    hex::decode(h).map_err(|_| Error::Peer("bad hex in payout message".into()))
}

fn decode_all<T, E: std::fmt::Display>(
    list: &[String],
    f: impl Fn(&[u8]) -> std::result::Result<T, E>,
) -> Result<Vec<T>> {
    (list.iter())
        .map(|h| f(&unhex(h)?).map_err(|e| Error::Peer(e.to_string())))
        .collect()
}

fn settle_err(e: impl std::fmt::Display) -> Error {
    Error::Settle(e.to_string())
}
