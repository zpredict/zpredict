//! The Gamma market record and what it means for a mirrored market.

use serde::de::{DeserializeOwned, Deserializer};
use serde::{Deserialize, Serialize};
use zpredict_oracle::{Error, Market, Result};

/// A mirrored market's params.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Params {
    pub condition_id: String,
    pub slug: String,
}

impl Params {
    /// Parses and checks the shape: `0x` + 64 lowercase hex, a URL-safe slug.
    pub fn of(m: &Market) -> Result<Self> {
        let p: Self = m.params()?;
        let hex = p.condition_id.strip_prefix("0x").unwrap_or("");
        let hex_ok = hex.len() == 64 && hex.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'));
        let slug_ok = !p.slug.is_empty()
            && (p.slug.bytes()).all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
        if !hex_ok || !slug_ok {
            return Err(Error::BadReply(format!(
                "market {}: polymarket params need conditionId 0x+64 hex and a slug",
                m.id
            )));
        }
        Ok(p)
    }
}

/// The fields of `GET /markets/slug/<slug>` this plugin reads. Gamma encodes the three
/// lists as JSON strings (`"[\"Yes\", \"No\"]"`).
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GammaMarket {
    pub question: String,
    pub condition_id: String,
    pub slug: String,
    #[serde(deserialize_with = "json_string")]
    pub outcomes: Vec<String>,
    #[serde(deserialize_with = "json_string")]
    pub outcome_prices: Vec<String>,
    #[serde(default)]
    pub closed: bool,
    #[serde(default)]
    pub uma_resolution_status: Option<String>,
    #[serde(default, deserialize_with = "json_string")]
    pub clob_token_ids: Vec<String>,
    /// When Polymarket last updated the record (RFC 3339).
    #[serde(default)]
    pub updated_at: Option<String>,
    /// Lifetime traded volume on Polymarket, USD.
    #[serde(default)]
    pub volume_num: Option<f64>,
}

fn json_string<'de, D: Deserializer<'de>, T: DeserializeOwned>(
    d: D,
) -> std::result::Result<T, D::Error> {
    let s = String::deserialize(d)?;
    serde_json::from_str(&s).map_err(serde::de::Error::custom)
}

impl GammaMarket {
    pub fn parse(json: &[u8]) -> Result<Self> {
        serde_json::from_slice(json).map_err(|e| Error::BadReply(format!("gamma: {e}")))
    }

    /// The record is the market `p` names and a binary Yes/No market.
    pub fn check(&self, p: &Params) -> Result<()> {
        if !self.condition_id.eq_ignore_ascii_case(&p.condition_id) || self.slug != p.slug {
            return Err(Error::BadReply(format!(
                "gamma: slug {} is conditionId {}, not {}",
                p.slug, self.condition_id, p.condition_id
            )));
        }
        if self.outcomes != ["Yes", "No"] || self.outcome_prices.len() != 2 {
            return Err(Error::BadReply(format!(
                "gamma: {} is not a binary Yes/No market (outcomes {:?})",
                p.slug, self.outcomes
            )));
        }
        Ok(())
    }

    /// `Some(yes)` once Polymarket settled the market; `None` while it is open, proposed
    /// or disputed. Call [`GammaMarket::check`] first.
    pub fn resolved_yes(&self) -> Option<bool> {
        let settled = self.closed && self.uma_resolution_status.as_deref() == Some("resolved");
        settled.then(|| self.outcome_prices[0].parse::<f64>() == Ok(1.0))
    }

    /// The Yes price in cents (one decimal), like zPredict's `lastPrice`.
    pub fn yes_cents(&self) -> Option<f64> {
        let p: f64 = self.outcome_prices.first()?.parse().ok()?;
        (0.0..=1.0)
            .contains(&p)
            .then(|| (p * 1000.0).round() / 10.0)
    }

    /// The CLOB token id of the Yes outcome, for price history.
    pub fn yes_token(&self) -> Option<&str> {
        self.clob_token_ids.first().map(String::as_str)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> GammaMarket {
        let path = format!("{}/testdata/{name}.json", env!("CARGO_MANIFEST_DIR"));
        GammaMarket::parse(&std::fs::read(path).unwrap()).unwrap()
    }

    fn params(g: &GammaMarket) -> Params {
        Params {
            condition_id: g.condition_id.clone(),
            slug: g.slug.clone(),
        }
    }

    #[test]
    fn open_market_has_a_price_and_no_outcome() {
        let g = fixture("open");
        g.check(&params(&g)).unwrap();
        assert_eq!(g.resolved_yes(), None);
        assert_eq!(g.yes_cents(), Some(66.5));
        assert!(g.yes_token().is_some());
        assert_eq!(g.volume_num.map(f64::round), Some(2_325_413.0));
        // A proposed (not yet final) UMA answer is not an outcome either.
        assert_eq!(fixture("proposed").resolved_yes(), None);
    }

    #[test]
    fn resolved_yes_and_no() {
        let yes = fixture("resolved-yes");
        yes.check(&params(&yes)).unwrap();
        assert_eq!(yes.resolved_yes(), Some(true));
        let no = fixture("resolved-no");
        no.check(&params(&no)).unwrap();
        assert_eq!(no.resolved_yes(), Some(false));
        let split = GammaMarket {
            outcome_prices: vec!["0.5".into(), "0.5".into()],
            ..yes
        };
        assert_eq!(split.resolved_yes(), Some(false), "50-50 is not Yes");
    }

    #[test]
    fn non_binary_and_mismatched_markets_are_rejected() {
        let g = fixture("non-binary");
        assert!(g.check(&params(&g)).is_err());
        let open = fixture("open");
        let other = Params {
            condition_id: format!("0x{}", "0".repeat(64)),
            ..params(&open)
        };
        assert!(open.check(&other).is_err());
    }
}
