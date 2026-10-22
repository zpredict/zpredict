//! `settle-payout`: the escrow key ceremony and batched payouts for scripts. Secrets
//! are only ever read from or written to sealed files ([`zpredict_settle::store`], key in
//! `ZPREDICT_STORE_KEY`).
//!
//! ```text
//! settle-payout dkg <main|test|regtest> <out-dir>   -> `group <ak-hex>`, `address <ua>`;
//!     writes r{0,1,2}-share.sealed and escrow-ufvk.sealed, nothing in clear
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

const USAGE: &str = "usage: settle-payout dkg <network> <out-dir> | create <network> <wallet-dir> <payouts> | sign <network> <payouts> <ufvk.sealed> <share.sealed>...";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    let result = match args.as_slice() {
        ["dkg", network, out] => dkg(network, Path::new(out)),
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

/// DKG, then each share and the escrow UFVK are sealed before anything touches disk.
fn dkg(network: &str, out: &Path) -> Result<()> {
    let key = store::key_from_env()?;
    let shares = zpredict_settle::dkg_local()?;
    let ak = shares[0].ak()?;
    let escrow = keys::escrow_keys(&ak, network)?;
    for (i, s) in shares.iter().enumerate() {
        let sealed = store::seal(&key, KeyShare::LABEL, &s.to_bytes()?);
        write_new(&out.join(format!("r{i}-share.sealed")), &sealed)?;
    }
    let ufvk = store::seal(&key, "ufvk", escrow.ufvk.as_bytes());
    write_new(&out.join("escrow-ufvk.sealed"), &ufvk)?;
    println!("group {}", hex::encode(ak));
    println!("address {}", escrow.address);
    Ok(())
}

/// Never overwrites: a second ceremony into the same directory is a mistake.
fn write_new(path: &Path, bytes: &[u8]) -> Result<()> {
    use std::os::unix::fs::OpenOptionsExt;
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)?;
    f.write_all(bytes)?;
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
