//! Gamma and CLOB over HTTPS, cached per market for [`TTL`], and the [`Resolver`].

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use zpredict_oracle::{Chain, Error, Market, Resolution, Resolver, Result};

use crate::{CLOB, GAMMA, GammaMarket, PLUGIN, Params, TIMEOUT, TTL};

/// One point of a price history: unix seconds and the Yes price in cents.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Point {
    pub t: u64,
    pub price: f64,
}

/// Shared handle: clones use the same cache, so the resolver and the relayer's reference
/// poller together fetch each market at most once per [`TTL`].
/// Use it from blocking threads only (the HTTP client is blocking); it is built on the
/// first request, so making a handle in async code is fine.
#[derive(Clone, Default)]
pub struct Polymarket(Arc<Inner>);

#[derive(Default)]
struct Inner {
    http: OnceLock<reqwest::blocking::Client>,
    /// Slug → when it was fetched and what came back (a failure is cached too, so a
    /// Polymarket outage costs one request per market per TTL).
    cache: Mutex<HashMap<String, Fetched>>,
}

/// When a record was fetched, and the record or the error text.
type Fetched = (Instant, std::result::Result<GammaMarket, String>);

impl Polymarket {
    fn get(&self, url: String) -> Result<Vec<u8>> {
        let http = self.0.http.get_or_init(|| {
            reqwest::blocking::Client::builder()
                .timeout(TIMEOUT)
                .connect_timeout(TIMEOUT / 2)
                .build()
                .expect("static client config")
        });
        Ok(http.get(url).send()?.error_for_status()?.bytes()?.to_vec())
    }

    /// The Gamma record for `p`, checked to be that binary market.
    pub fn market(&self, p: &Params) -> Result<GammaMarket> {
        let g = self.record(&p.slug)?;
        g.check(p)?;
        Ok(g)
    }

    /// The Gamma record for `slug`, unchecked: an error here means Gamma could not be read.
    // ponytail: the lock is held across the fetch (≤ TIMEOUT), serializing the two pollers.
    pub fn record(&self, slug: &str) -> Result<GammaMarket> {
        let mut cache = self.0.cache.lock().expect("cache lock");
        let fresh = cache.get(slug).filter(|(at, _)| at.elapsed() < TTL);
        let got = match fresh {
            Some((_, r)) => r.clone(),
            None => {
                let r = self.fetch(slug).map_err(|e| e.to_string());
                cache.insert(slug.to_owned(), (Instant::now(), r.clone()));
                r
            }
        };
        got.map_err(Error::BadReply)
    }

    fn fetch(&self, slug: &str) -> Result<GammaMarket> {
        let url = format!("{GAMMA}/markets/slug/{slug}");
        GammaMarket::parse(&self.get(url)?)
    }

    /// The last week of hourly Yes prices for a CLOB token. Not cached: the caller polls
    /// it once per TTL.
    pub fn history(&self, token: &str) -> Result<Vec<Point>> {
        #[derive(Deserialize)]
        struct Reply {
            history: Vec<Raw>,
        }
        #[derive(Deserialize)]
        struct Raw {
            t: u64,
            p: f64,
        }
        let url = format!("{CLOB}/prices-history?market={token}&interval=1w&fidelity=60");
        let r: Reply = serde_json::from_slice(&self.get(url)?)
            .map_err(|e| Error::BadReply(format!("clob: {e}")))?;
        Ok((r.history.into_iter())
            .map(|x| Point {
                t: x.t,
                price: (x.p * 1000.0).round() / 10.0,
            })
            .collect())
    }
}

impl Resolver for Polymarket {
    /// Ignores the chain: the outcome is whatever Polymarket settled.
    fn resolve(&self, market: &Market, _chain: &dyn Chain) -> Result<Option<Resolution>> {
        let p = Params::of(market)?;
        let g = self.market(&p)?;
        Ok(g.resolved_yes()
            .map(|yes| Resolution::from_source(market, PLUGIN, &p.condition_id, yes)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zpredict_oracle::{Evidence, FixtureChain, Outcome};

    fn market(slug: &str, cid: &str) -> Market {
        serde_json::from_value(serde_json::json!({
            "id": 11, "question": "q?", "plugin": "polymarket",
            "params": {"conditionId": cid, "slug": slug},
            "closeHeight": 90, "resolveHeight": 90, "status": "closed"
        }))
        .unwrap()
    }

    /// Seeds the cache with a fixture, so `resolve` runs without the network.
    fn seeded(name: &str) -> (Polymarket, Market) {
        let path = format!("{}/testdata/{name}.json", env!("CARGO_MANIFEST_DIR"));
        let g = GammaMarket::parse(&std::fs::read(path).unwrap()).unwrap();
        let pm = Polymarket::default();
        let m = market(&g.slug, &g.condition_id);
        let entry = (Instant::now(), Ok(g.clone()));
        pm.0.cache.lock().unwrap().insert(g.slug, entry);
        (pm, m)
    }

    #[test]
    fn resolves_from_the_cached_record() {
        let chain = FixtureChain::default();
        let (pm, m) = seeded("open");
        assert_eq!(pm.resolve(&m, &chain).unwrap(), None);
        let (pm, m) = seeded("resolved-yes");
        let r = pm.resolve(&m, &chain).unwrap().unwrap();
        assert_eq!(r.outcome, Outcome::Yes);
        let cid = "0x96df10bb5b67b16adf969226919cf818f8b3935c6ef9c79507d6169994b2c4e6";
        let source = Evidence::Source {
            source: "polymarket".into(),
            condition_id: cid.into(),
        };
        assert_eq!(r.evidence, source);
        let (pm, m) = seeded("resolved-no");
        assert_eq!(
            pm.resolve(&m, &chain).unwrap().unwrap().outcome,
            Outcome::No
        );
        let (pm, m) = seeded("non-binary");
        assert!(pm.resolve(&m, &chain).is_err());
        let bad = market("UPPER", cid);
        assert!(pm.resolve(&bad, &chain).is_err(), "params are checked");
    }

    #[test]
    #[ignore = "network"]
    fn live() {
        let p = Params {
            condition_id: "0x34918035a590555ba1fb1d6a019d766ab6e557d63e7f3140b63b4550eee7f417"
                .into(),
            slug: "will-the-democrats-win-the-texas-senate-race-in-2026".into(),
        };
        let pm = Polymarket::default();
        let g = pm.market(&p).unwrap();
        println!("{:?} {:?}", g.yes_cents(), g.resolved_yes());
        let h = pm.history(g.yes_token().unwrap()).unwrap();
        assert!(!h.is_empty());
    }
}
