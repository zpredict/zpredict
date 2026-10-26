//! ZEC/USD for display only (`GET /price`): the app shows "≈ $x" beside ZEC amounts. Nothing
//! in clearing, balances, payouts or resolution reads it.
//!
//! Each relayer fetches Coinbase's public spot price itself, once per `TTL`, with a timeout
//! and no retries: a failure keeps the last good price and is retried next round. The browser
//! never contacts Coinbase; Coinbase sees only the relayer VM's address.

use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const URL: &str = "https://api.coinbase.com/v2/prices/ZEC-USD/spot";
const TTL: Duration = Duration::from_secs(300);
const TIMEOUT: Duration = Duration::from_secs(10);

/// The latest spot price, `None` until the first fetch succeeds.
pub type Price = Arc<Mutex<Option<Spot>>>;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Spot {
    pub zec_usd: f64,
    pub source: &'static str,
    /// When this relayer fetched it (unix seconds).
    pub at: u64,
}

/// Refreshes `price` forever, once per `TTL`.
pub fn poll(price: Price) {
    let http = reqwest::blocking::Client::builder()
        .timeout(TIMEOUT)
        .connect_timeout(TIMEOUT / 2)
        .build()
        .expect("static client config");
    loop {
        let body = http
            .get(URL)
            .send()
            .and_then(|r| r.error_for_status())
            .and_then(|r| r.bytes());
        match body.map_err(|e| e.to_string()).and_then(|b| parse(&b)) {
            Ok(zec_usd) => {
                let at = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_or(0, |d| d.as_secs());
                let spot = Spot {
                    zec_usd,
                    source: "coinbase",
                    at,
                };
                *price.lock().expect("price lock") = Some(spot);
            }
            Err(e) => eprintln!("price: {e}"),
        }
        std::thread::sleep(TTL);
    }
}

/// Coinbase's `{"data":{"amount":"…","base":"ZEC","currency":"USD"}}`, checked.
fn parse(body: &[u8]) -> Result<f64, String> {
    #[derive(Deserialize)]
    struct Reply {
        data: Data,
    }
    #[derive(Deserialize)]
    struct Data {
        amount: String,
        base: String,
        currency: String,
    }
    let r: Reply = serde_json::from_slice(body).map_err(|e| e.to_string())?;
    let d = r.data;
    if (d.base.as_str(), d.currency.as_str()) != ("ZEC", "USD") {
        return Err(format!("unexpected pair {}-{}", d.base, d.currency));
    }
    match d.amount.parse::<f64>() {
        Ok(p) if p.is_finite() && p > 0.0 => Ok(p),
        _ => Err(format!("bad amount {:?}", d.amount)),
    }
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn parses_only_a_positive_zec_usd_price() {
        let ok = br#"{"data":{"amount":"1237.34","base":"ZEC","currency":"USD"}}"#;
        assert_eq!(parse(ok), Ok(1237.34));
        let pair = br#"{"data":{"amount":"1.0","base":"BTC","currency":"USD"}}"#;
        assert!(parse(pair).is_err());
        for amount in ["0", "-3", "NaN", "inf", "x"] {
            let body =
                format!(r#"{{"data":{{"amount":"{amount}","base":"ZEC","currency":"USD"}}}}"#);
            assert!(parse(body.as_bytes()).is_err(), "{amount}");
        }
        assert!(parse(b"{}").is_err());
    }
}
