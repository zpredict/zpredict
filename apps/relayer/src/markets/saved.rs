//! `data_dir/markets.json`: the market list as last served, so rolling markets and signed
//! outcomes survive a restart. Outcomes could be recomputed from the chain, but FROST
//! signatures are randomized and the rolling list is not in the config. Public data only.

use std::path::Path;

use zpredict_oracle::Market;

const FILE: &str = "markets.json";

/// The configured markets, each replaced by its saved copy if the saved one has the same
/// terms (an edited market starts over), plus every saved rolling market.
pub fn load(dir: &Path, configured: Vec<Market>) -> Vec<Market> {
    let saved: Vec<Market> = match std::fs::read(dir.join(FILE)) {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_else(|e| {
            eprintln!("markets: ignoring {FILE}: {e}");
            Vec::new()
        }),
        Err(_) => Vec::new(),
    };
    let same_terms = |a: &Market, b: &Market| {
        (
            a.id,
            &a.question,
            &a.plugin,
            &a.params,
            a.close_height,
            a.resolve_height,
        ) == (
            b.id,
            &b.question,
            &b.plugin,
            &b.params,
            b.close_height,
            b.resolve_height,
        )
    };
    let mut out: Vec<Market> = configured
        .into_iter()
        .map(|c| {
            saved
                .iter()
                .find(|s| same_terms(s, &c))
                .cloned()
                .unwrap_or(c)
        })
        .collect();
    let rolling: Vec<Market> = (saved.into_iter())
        .filter(|s| s.rolling && !out.iter().any(|m| m.id == s.id))
        .collect();
    out.extend(rolling);
    out
}

/// Writes the list atomically (temp file, then rename).
pub fn save(dir: &Path, markets: &[Market]) -> std::io::Result<()> {
    let tmp = dir.join(format!("{FILE}.tmp"));
    std::fs::write(&tmp, serde_json::to_vec(markets)?)?;
    std::fs::rename(tmp, dir.join(FILE))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::tests::temp_dir;
    use zpredict_oracle::Status;

    fn market(id: u32, question: &str) -> Market {
        serde_json::from_value(serde_json::json!({
            "id": id, "question": question, "plugin": "shielded-actions",
            "params": {"minActions": 1}, "closeHeight": 90, "resolveHeight": 100,
            "status": "open"
        }))
        .unwrap()
    }

    #[test]
    fn keeps_progress_rolling_markets_and_config_edits() {
        let dir = temp_dir("saved-markets");
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(load(&dir, vec![market(1, "a?")]), vec![market(1, "a?")]);

        let mut signed = market(1, "a?");
        (signed.status, signed.outcome_sig) = (Status::Resolved, Some("ab".into()));
        let mut edited = market(2, "b?");
        edited.status = Status::Closed;
        let rolling = Market {
            rolling: true,
            ..market(1_000_005, "r?")
        };
        save(&dir, &[signed.clone(), edited, rolling.clone()]).unwrap();

        let config = vec![market(1, "a?"), market(2, "b, reworded?")];
        let got = load(&dir, config);
        assert_eq!(got, vec![signed, market(2, "b, reworded?"), rolling]);
    }
}
