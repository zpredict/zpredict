//! Reference prices for mirrored markets (`plugin = "polymarket"`): the source market's own
//! Yes price and last week of hourly prices, served as `reference` in `GET /markets`.
//!
//! Each relayer fetches public data from Polymarket itself, at most once per market per
//! `TTL` (5 min, Gamma's own cache age), with a timeout and no retries: a failure keeps
//! the last good reference and is retried on the next round. The browser never contacts
//! Polymarket; it only gets this record (and a plain link to the market page).

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use zpredict_oracle::{Market, Result, Status};
use zpredict_plugin_polymarket::{PLUGIN, Params, Point, Polymarket, SITE, TTL};

use crate::error::Error;
use crate::state::Shared;

/// Market id → its latest reference.
pub type References = Arc<Mutex<BTreeMap<u32, Reference>>>;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reference {
    pub source: &'static str,
    /// Yes price in cents, like `lastPrice`.
    pub price: f64,
    /// The public market page, for an outbound link.
    pub url: String,
    /// When Polymarket last updated its record (RFC 3339).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// Hourly Yes prices in cents over the last week, oldest first (`t` = unix seconds).
    pub history: Vec<Point>,
}

/// The mirrored markets' params, rejecting malformed ones (config validation).
pub fn mirrored(markets: &[Market]) -> Result<Vec<(u32, Params)>> {
    (markets.iter())
        .filter(|m| m.plugin == PLUGIN)
        .map(|m| Ok((m.id, Params::of(m)?)))
        .collect()
}

/// At startup: every mirrored market must be the binary Yes/No market its params name. A
/// Gamma that cannot be reached only warns, so a Polymarket outage never stops a relayer
/// (the resolver checks the record again before every outcome).
pub fn check(pm: &Polymarket, markets: &[Market]) -> std::result::Result<(), Error> {
    let bad = |e: zpredict_oracle::Error| Error::Config(e.to_string());
    for (id, p) in mirrored(markets).map_err(bad)? {
        match pm.record(&p.slug) {
            Ok(g) => g.check(&p).map_err(bad)?,
            Err(e) => eprintln!("reference: market {id}: cannot check against Gamma: {e}"),
        }
    }
    Ok(())
}

/// Refreshes every mirrored market's reference forever, once per `TTL`. Resolved markets
/// keep their last reference.
pub fn poll(pm: Polymarket, state: Shared, refs: References) {
    loop {
        let have = refs.lock().expect("refs lock").clone();
        let mut due = state.lock().expect("state lock").markets.clone();
        due.retain(|m| m.status != Status::Resolved || !have.contains_key(&m.id));
        for (id, p) in mirrored(&due).unwrap_or_default() {
            match fetch(&pm, &p, have.get(&id)) {
                Ok(r) => {
                    refs.lock().expect("refs lock").insert(id, r);
                }
                Err(e) => eprintln!("reference: market {id}: {e}"),
            }
        }
        std::thread::sleep(TTL);
    }
}

/// One market's reference; a failed history keeps `last`'s.
fn fetch(pm: &Polymarket, p: &Params, last: Option<&Reference>) -> Result<Reference> {
    let g = pm.market(p)?;
    let price = g
        .yes_cents()
        .ok_or_else(|| zpredict_oracle::Error::BadReply("gamma: no Yes price".into()))?;
    let history = match g.yes_token().map(|t| pm.history(t)) {
        Some(Ok(h)) => h,
        Some(Err(e)) => {
            eprintln!("reference: {}: history: {e}", p.slug);
            last.map(|r| r.history.clone()).unwrap_or_default()
        }
        None => Vec::new(),
    };
    Ok(Reference {
        source: PLUGIN,
        price,
        url: format!("{SITE}{}", p.slug),
        updated_at: g.updated_at,
        history,
    })
}
