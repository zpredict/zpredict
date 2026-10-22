//! `settle-payout`: batched escrow payouts for scripts. Secrets come only from sealed
//! files ([`zpredict_settle::store`], key in `ZPREDICT_STORE_KEY`).
//!
//! ```text
//! settle-payout import-share <frost-client.toml> <out.sealed>
//! settle-payout create <network> <escrow-wallet-dir> <payouts> > created.pczt
//! settle-payout sign <network> <payouts> <ufvk.sealed> <share.sealed>... < created.pczt > signed.pczt
//! ```
//!
//! `<payouts>` is a file with one `<unified address> <zats>` line per winner. `sign`
//! runs one FROST session over every spend; each listed signer independently verifies
//! the PCZT against `<payouts>` first and the command fails if any of them refuses.

use std::io::{Read, Write};
use std::path::Path;

use pczt::Pczt;
use zcash_protocol::consensus::{Network, Parameters};
use zpredict_settle::{Error, KeyShare, Payout, Result, keys, payout, store};

const USAGE: &str = "usage: settle-payout import-share <toml> <out> | create <network> <wallet-dir> <payouts> | sign <network> <payouts> <ufvk.sealed> <share.sealed>...";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    let result = match args.as_slice() {
        ["import-share", toml, out] => import_share(Path::new(toml), Path::new(out)),
        [cmd @ ("create" | "sign"), "main", rest @ ..] => run(&Network::MainNetwork, cmd, rest),
        [cmd @ ("create" | "sign"), "test", rest @ ..] => run(&Network::TestNetwork, cmd, rest),
        [cmd @ ("create" | "sign"), "regtest", rest @ ..] => run(&keys::regtest(), cmd, rest),
        _ => Err(Error::Usage(USAGE.into())),
    };
    if let Err(e) = result {
        eprintln!("settle-payout: {e}");
        std::process::exit(1);
    }
}

fn import_share(toml: &Path, out: &Path) -> Result<()> {
    let share = KeyShare::from_frost_client_config(&std::fs::read_to_string(toml)?)?;
    let sealed = store::seal(&store::key_from_env()?, KeyShare::LABEL, &share.to_bytes()?);
    std::fs::write(out, sealed)?;
    Ok(())
}

fn run<P: Parameters + Clone>(params: &P, cmd: &str, args: &[&str]) -> Result<()> {
    match (cmd, args) {
        ("create", [wallet, payouts]) => {
            let payouts = read_payouts(params, Path::new(payouts))?;
            let pczt = payout::create(params, Path::new(wallet), &payouts)?;
            write_pczt(pczt)
        }
        ("sign", [payouts, ufvk, shares @ ..]) if !shares.is_empty() => {
            let payouts = read_payouts(params, Path::new(payouts))?;
            let ufvk = String::from_utf8(store::open_file(Path::new(ufvk), "ufvk")?)
                .map_err(|_| Error::Encoding("sealed UFVK is not text".into()))?;
            let fvk = zpredict_settle::decode_fvk(ufvk.trim())?;
            let shares = shares
                .iter()
                .map(|s| KeyShare::from_bytes(&store::open_file(Path::new(s), KeyShare::LABEL)?))
                .collect::<Result<Vec<_>>>()?;
            let mut buf = vec![];
            std::io::stdin().read_to_end(&mut buf)?;
            let pczt = Pczt::parse(&buf).map_err(|e| Error::Pczt(format!("{e:?}")))?;
            let signers: Vec<&KeyShare> = shares.iter().collect();
            let sigs = zpredict_settle::sign_all(&pczt, &payouts, &fvk, &signers)?;
            eprintln!(
                "{} signer(s) verified {} payout(s) and signed {} spend(s), sighash {}",
                signers.len(),
                payouts.len(),
                sigs.len(),
                hex::encode(zpredict_settle::sighash(&pczt)?)
            );
            write_pczt(zpredict_settle::apply(pczt, &sigs)?)
        }
        _ => Err(Error::Usage(USAGE.into())),
    }
}

fn read_payouts<P: Parameters>(params: &P, path: &Path) -> Result<Vec<Payout>> {
    std::fs::read_to_string(path)?
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| match l.split_whitespace().collect::<Vec<_>>()[..] {
            [ua, zats] => {
                let zats = zats
                    .parse()
                    .map_err(|_| Error::Usage(format!("bad amount {zats:?}")))?;
                Payout::parse(params, ua, zats)
            }
            _ => Err(Error::Usage(format!(
                "expected `<address> <zats>`, got {l:?}"
            ))),
        })
        .collect()
}

fn write_pczt(pczt: Pczt) -> Result<()> {
    let bytes = pczt
        .serialize()
        .map_err(|e| Error::Pczt(format!("{e:?}")))?;
    std::io::stdout().write_all(&bytes)?;
    Ok(())
}
