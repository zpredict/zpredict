//! `zpredict-relayer <config.toml>` runs a relayer;
//! `zpredict-relayer keygen <prefix>` writes a Noise key pair to `<prefix>.key` / `.pub`.

use std::path::Path;
use std::process::ExitCode;

use zpredict_relayer::{Config, keys, server};

#[tokio::main]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let res = match args.as_slice() {
        [cmd, prefix] if cmd == "keygen" => {
            keys::keygen(Path::new(prefix)).map(|p| println!("{p}"))
        }
        [path] => match Config::load(Path::new(path)) {
            Ok(c) => server::run(c).await,
            Err(e) => Err(e),
        },
        _ => {
            eprintln!("usage: zpredict-relayer <config.toml> | keygen <prefix>");
            return ExitCode::from(2);
        }
    };
    match res {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("zpredict-relayer: {e}");
            ExitCode::FAILURE
        }
    }
}
