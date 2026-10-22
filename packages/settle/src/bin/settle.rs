//! `settle`: relayer-side escrow commands for scripts. Secrets are read from and
//! written to sealed files only ([`zpredict_settle::store`], key in `ZPREDICT_STORE_KEY`).
//!
//! ```text
//! settle seal <label> < secret > secret.sealed
//! settle zats <units>                               -> zatoshis of a fixed denomination
//! settle memo-key <out.sealed>                      -> `pubkey <hex>`
//! settle deposit-memo <tag-hex> <pk0> <pk1> <pk2>   -> base64url memo for a ZIP 321 `memo=`
//! settle scan <relayer> <ufvk.sealed> <memo-key.sealed> <lightwalletd-url> <from> <to>
//!   -> `deposit <txid> <action> <height> <units> <tag> <balance-share>` per credit,
//!      `flagged <txid> <action> <height> <zats> <reason>` per note left alone
//! ```

use std::io::{Read, Write};
use std::path::Path;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use zpredict_settle::{Error, MemoKey, Result, Scanner, store};

const USAGE: &str = "usage: settle seal <label> | zats <units> | memo-key <out> | deposit-memo <tag> <pk0> <pk1> <pk2> | scan <relayer> <ufvk.sealed> <memo-key.sealed> <lwd-url> <from> <to>";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    if let Err(e) = run(&args) {
        eprintln!("settle: {e}");
        std::process::exit(1);
    }
}

fn run(args: &[&str]) -> Result<()> {
    match args {
        ["seal", label] => {
            let mut plain = vec![];
            std::io::stdin().read_to_end(&mut plain)?;
            let sealed = store::seal(&store::key_from_env()?, label, &plain);
            std::io::stdout().write_all(&sealed)?;
        }
        ["zats", units] => {
            let units: u64 = parse(units)?;
            if !zpredict_settle::DENOMINATIONS.contains(&units) {
                return Err(Error::Usage(format!(
                    "{units} is not a deposit denomination"
                )));
            }
            println!("{}", units * zpredict_settle::UNIT_ZATS);
        }
        ["memo-key", out] => {
            let key = MemoKey::generate();
            std::fs::write(
                out,
                store::seal(&store::key_from_env()?, "memo-key", &key.to_bytes()),
            )?;
            println!("pubkey {}", hex::encode(key.public()));
        }
        ["deposit-memo", tag, pks @ ..] if pks.len() == 3 => {
            let pks = [hex_array(pks[0])?, hex_array(pks[1])?, hex_array(pks[2])?];
            let memo = zpredict_settle::memo::encode(&hex_array(tag)?, &pks);
            let end = memo.iter().rposition(|b| *b != 0).map_or(0, |i| i + 1);
            println!("{}", URL_SAFE_NO_PAD.encode(&memo[..end]));
        }
        ["scan", relayer, ufvk, memo_key, lwd, from, to] => scan(
            parse(relayer)?,
            Path::new(ufvk),
            Path::new(memo_key),
            lwd,
            (parse(from)?, parse(to)?),
        )?,
        _ => return Err(Error::Usage(USAGE.into())),
    }
    Ok(())
}

fn scan(relayer: usize, ufvk: &Path, memo_key: &Path, lwd: &str, range: (u32, u32)) -> Result<()> {
    let ufvk = String::from_utf8(store::open_file(ufvk, "ufvk")?)
        .map_err(|_| Error::Encoding("sealed UFVK is not text".into()))?;
    let fvk = zpredict_settle::decode_fvk(ufvk.trim())?;
    let key: [u8; 32] = store::open_file(memo_key, "memo-key")?
        .try_into()
        .map_err(|_| Error::Store("memo key must be 32 bytes".into()))?;
    let key = MemoKey::from_bytes(key);
    let lwd = zpredict_oracle::Lightwalletd::new(lwd).map_err(|e| Error::Chain(e.to_string()))?;
    let txid = |t: &[u8; 32]| hex::encode(t.iter().rev().copied().collect::<Vec<_>>());
    for s in Scanner::new(&fvk, relayer, key).blocks(&lwd, range.0, range.1)? {
        match s {
            Ok(d) => println!(
                "deposit {} {} {} {} {} {}",
                txid(&d.note.txid),
                d.note.action,
                d.height,
                d.units,
                hex::encode(d.tag),
                d.balance_share(relayer)
            ),
            Err(f) => println!(
                "flagged {} {} {} {} {:?}",
                txid(&f.note.txid),
                f.note.action,
                f.height,
                f.zats,
                f.reason
            ),
        }
    }
    Ok(())
}

fn parse<T: std::str::FromStr>(s: &str) -> Result<T> {
    s.parse()
        .map_err(|_| Error::Usage(format!("bad number {s:?}")))
}

fn hex_array<const N: usize>(s: &str) -> Result<[u8; N]> {
    hex::decode(s.trim())
        .ok()
        .and_then(|v| v.try_into().ok())
        .ok_or_else(|| Error::Usage(format!("expected {N} hex-encoded bytes")))
}
