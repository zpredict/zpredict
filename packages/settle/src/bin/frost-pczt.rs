//! `frost-pczt`: command-line wrapper over `zpredict_settle` for scripts.
//!
//! ```text
//! frost-pczt ufvk <ak-hex> <main|test|regtest>   -> `ufvk <..>` and `address <..>`
//! frost-pczt sighash < created.pczt               -> `sighash <hex>`, then one
//!                                                    `randomizer <pool> <index> <hex>` per spend
//! frost-pczt apply <pool>:<index>:<sig-hex>... < created.pczt > signed.pczt
//! ```

use std::io::{Read, Write};

use pczt::Pczt;
use zpredict_settle::{Error, Pool, Result, SpendSig};

const USAGE: &str = "usage: frost-pczt ufvk <ak-hex> <main|test|regtest> | sighash | apply <pool>:<index>:<sig-hex>...";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    if let Err(e) = run(&args) {
        eprintln!("frost-pczt: {e}");
        std::process::exit(1);
    }
}

fn run(args: &[&str]) -> Result<()> {
    match args {
        ["ufvk", ak, network] => {
            let keys = zpredict_settle::escrow_keys(&hex_array(ak)?, network)?;
            println!("ufvk {}", keys.ufvk);
            println!("address {}", keys.address);
        }
        ["sighash"] => {
            let pczt = read_pczt()?;
            println!("sighash {}", hex::encode(zpredict_settle::sighash(&pczt)?));
            for r in zpredict_settle::randomizers(&pczt)? {
                let (pool, i, alpha) = (r.pool.name(), r.index, hex::encode(r.alpha));
                println!("randomizer {pool} {i} {alpha}");
            }
        }
        ["apply", sigs @ ..] if !sigs.is_empty() => {
            let sigs = sigs
                .iter()
                .map(|s| parse_sig(s))
                .collect::<Result<Vec<_>>>()?;
            let signed = zpredict_settle::apply(read_pczt()?, &sigs)?;
            let bytes = signed
                .serialize()
                .map_err(|e| Error::Pczt(format!("{e:?}")))?;
            std::io::stdout().write_all(&bytes)?;
        }
        _ => return Err(Error::Usage(USAGE.into())),
    }
    Ok(())
}

fn read_pczt() -> Result<Pczt> {
    let mut buf = vec![];
    std::io::stdin().read_to_end(&mut buf)?;
    Pczt::parse(&buf).map_err(|e| Error::Pczt(format!("{e:?}")))
}

fn parse_sig(arg: &str) -> Result<SpendSig> {
    let [pool, index, sig] = arg.split(':').collect::<Vec<_>>()[..] else {
        return Err(Error::Usage(format!(
            "expected <pool>:<index>:<sig-hex>, got {arg:?}"
        )));
    };
    Ok(SpendSig {
        pool: Pool::parse(pool)?,
        index: index
            .parse()
            .map_err(|_| Error::Usage(format!("bad index {index:?}")))?,
        sig: hex_array(sig)?,
    })
}

fn hex_array<const N: usize>(s: &str) -> Result<[u8; N]> {
    hex::decode(s.trim())
        .ok()
        .and_then(|v| v.try_into().ok())
        .ok_or_else(|| Error::Usage(format!("expected {N} hex-encoded bytes")))
}
