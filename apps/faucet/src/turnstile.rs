//! Cloudflare Turnstile siteverify, the faucet's first anti-abuse layer (the hashcash
//! [`crate::pow`] stays as the second). The widget is rendered with the faucet challenge as
//! its `cdata`, so a token is tied to one challenge; Cloudflare accepts a token once.
//! The caller's IP is never forwarded (`remoteip` is not sent).

use serde::Deserialize;
use serde_json::json;

pub const SITEVERIFY: &str = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

pub struct Turnstile {
    pub secret: String,
    pub url: String,
    client: reqwest::Client,
}

#[derive(Deserialize)]
struct Reply {
    success: bool,
    #[serde(default)]
    cdata: Option<String>,
}

impl Turnstile {
    pub fn new(secret: String, url: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("TLS client");
        Turnstile {
            secret,
            url,
            client,
        }
    }

    /// True iff Cloudflare accepts `token` and it was issued for `challenge`.
    pub async fn verify(&self, token: &str, challenge: &str) -> bool {
        if token.is_empty() || token.len() > 2048 {
            return false;
        }
        let body = json!({ "secret": self.secret, "response": token });
        let reply = async {
            let r = self.client.post(&self.url).json(&body).send().await?;
            r.error_for_status()?.json::<Reply>().await
        };
        match reply.await {
            Ok(r) => r.success && r.cdata.as_deref() == Some(challenge),
            Err(_) => false,
        }
    }
}
