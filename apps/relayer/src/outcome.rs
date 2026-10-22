//! FROST-signed outcomes. Each relayer resolves markets against its own node
//! (`chain.rs`); at the start of every batch, over the batch's Noise links, the three swap
//! what they resolved and sign only what all three agree on:
//!
//! 1. every relayer sends its unsigned resolutions and, if it holds a FROST share, a fresh
//!    round-1 commitment for each;
//! 2. a resolution is agreed iff all three sent exactly the same one (market, outcome,
//!    height, block hash). Its signers are the first two relayers, by index, that
//!    committed to it; they send their round-2 shares over `Resolution::message()`;
//! 3. every relayer with a share aggregates, checks the signature against the group key
//!    (`zpredict_settle::outcome`) and stores it as the market's `outcomeSig`.
//!
//! Every relayer sends both messages every batch, even with nothing to sign or no share,
//! so the links stay in step with the batch protocol that follows. Without a share
//! (`frost_share_file` unset) outcomes stay unsigned; nothing is ever faked. Nonces live
//! for one round only.
//!
//! ponytail: a relayer proposes only markets it holds no signature for, so one that lost a
//! signature (crash before `markets.json` was saved) leaves that market unsigned for good;
//! share signatures in the proposal if that ever happens.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use zpredict_oracle::{Market, Resolution};
use zpredict_settle::{KeyShare, THRESHOLD, outcome, store};

use crate::error::{Error, Result};
use crate::peers::Links;
use crate::state::Shared;

/// Opens the sealed share and checks it belongs to relayer `index`.
pub fn load_share(path: &Path, index: usize) -> Result<KeyShare> {
    let bad = |e: zpredict_settle::Error| Error::Config(format!("frost share: {e}"));
    let share = KeyShare::from_bytes(&store::open_file(path, KeyShare::LABEL).map_err(bad)?)
        .map_err(bad)?;
    if share.id() != outcome::identifier(index).map_err(bad)? {
        return Err(Error::Config(format!(
            "frost share is not relayer {index}'s"
        )));
    }
    Ok(share)
}

#[derive(Default, Serialize, Deserialize)]
struct Propose {
    resolutions: Vec<Resolution>,
    /// Market id → hex round-1 commitment.
    commitments: BTreeMap<u32, String>,
}

#[derive(Default, Serialize, Deserialize)]
struct Shares {
    /// Market id → hex signature share.
    shares: BTreeMap<u32, String>,
}

/// One signing round; see the module docs. Errors only on link or protocol failures.
pub async fn round(links: &Links, state: &Shared, share: Option<&KeyShare>) -> Result<()> {
    let me = links.party;
    let others: Vec<usize> = (0..3).filter(|&p| p != me).collect();
    let mine: Vec<Resolution> = (state.lock().expect("state lock").markets.iter())
        .filter(|m| m.outcome_sig.is_none())
        .filter_map(Market::resolution)
        .collect();

    let mut nonces = BTreeMap::new();
    let mut hello = Propose {
        resolutions: mine.clone(),
        ..Propose::default()
    };
    for r in mine.iter().filter(|_| share.is_some()) {
        match outcome::commit(share.expect("filtered")) {
            Ok((n, c)) => {
                nonces.insert(r.market, n);
                hello.commitments.insert(r.market, hex::encode(c));
            }
            Err(e) => eprintln!("outcome: commit for market {}: {e}", r.market),
        }
    }
    let props = exchange(links, &others, hello).await?;

    // Agreed resolutions and their signers' commitments (relayer index → bytes).
    let plan: Vec<(Resolution, BTreeMap<usize, Vec<u8>>)> = (mine.into_iter())
        .filter(|r| others.iter().all(|p| props[*p].resolutions.contains(r)))
        .filter_map(|r| {
            let signers = (0..3)
                .filter_map(|p| Some((p, hex::decode(props[p].commitments.get(&r.market)?).ok()?)))
                .take(usize::from(THRESHOLD))
                .collect::<BTreeMap<_, _>>();
            (signers.len() == usize::from(THRESHOLD)).then_some((r, signers))
        })
        .collect();

    let mut out = Shares::default();
    if let Some(s) = share {
        for (r, signers) in plan.iter().filter(|(_, c)| c.contains_key(&me)) {
            match outcome::sign(s, &nonces[&r.market], signers, &r.message()) {
                Ok(sh) => {
                    out.shares.insert(r.market, hex::encode(sh));
                }
                Err(e) => eprintln!("outcome: signing market {}: {e}", r.market),
            }
        }
    }
    let shares = exchange(links, &others, out).await?;
    let Some(s) = share else { return Ok(()) };

    for (r, signers) in plan {
        let got: Option<BTreeMap<usize, Vec<u8>>> = (signers.keys())
            .map(|p| Some((*p, hex::decode(shares[*p].shares.get(&r.market)?).ok()?)))
            .collect();
        let Some(got) = got else { continue };
        match outcome::aggregate(s, &signers, &got, &r.message()) {
            Ok(sig) => {
                let mut st = state.lock().expect("state lock");
                let m = st.markets.iter_mut().find(|m| m.id == r.market);
                // Only if the market still carries the resolution that was signed.
                if let Some(m) = m.filter(|m| m.resolution().as_ref() == Some(&r)) {
                    m.outcome_sig = Some(hex::encode(sig));
                }
            }
            Err(e) => eprintln!("outcome: market {}: {e}", r.market),
        }
    }
    Ok(())
}

/// Sends `mine` to both peers and returns all three messages by relayer index.
async fn exchange<T>(links: &Links, others: &[usize], mine: T) -> Result<Vec<T>>
where
    T: Serialize + for<'de> Deserialize<'de> + Default,
{
    let bytes = serde_json::to_vec(&mine)?;
    for &p in others {
        links.send(p, &bytes).await?;
    }
    let mut all: Vec<T> = (0..3).map(|_| T::default()).collect();
    for &p in others {
        all[p] = serde_json::from_slice(&links.recv(p).await?)?;
    }
    all[links.party] = mine;
    Ok(all)
}
