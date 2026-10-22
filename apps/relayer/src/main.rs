//! `zpredict-relayer <config.toml>` runs a relayer;
//! `zpredict-relayer keygen <prefix>` writes a Noise key pair to `<prefix>.key` / `.pub`;
//! `zpredict-relayer health <host:port>` exits 0 iff `GET /health` answers 200 (the Docker
//! healthcheck: the distroless image has no shell or curl).

use std::io::{Read, Write};
use std::path::Path;
use std::process::ExitCode;
use std::time::Duration;

use zpredict_relayer::{Config, keys, server};

#[tokio::main]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let res = match args.as_slice() {
        [cmd, prefix] if cmd == "keygen" => {
            keys::keygen(Path::new(prefix)).map(|p| println!("{p}"))
        }
        [cmd, addr] if cmd == "health" => {
            return if health(addr).unwrap_or(false) {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            };
        }
        [path] => match Config::load(Path::new(path)) {
            Ok(c) => server::run(c).await,
            Err(e) => Err(e),
        },
        _ => {
            eprintln!(
                "usage: zpredict-relayer <config.toml> | keygen <prefix> | health <host:port>"
            );
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

fn health(addr: &str) -> std::io::Result<bool> {
    let mut s = std::net::TcpStream::connect(addr)?;
    s.set_read_timeout(Some(Duration::from_secs(3)))?;
    s.write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")?;
    let mut status = [0u8; 12]; // "HTTP/1.1 200"
    s.read_exact(&mut status)?;
    Ok(&status[9..] == b"200")
}
