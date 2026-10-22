//! Regtest end to end: a deposit made by `scripts/scan-e2e.sh` is seen by all three
//! relayers. Ignored by default; the script runs it with `--ignored` once the deposit
//! is mined. Reads the run directory the script wrote (`RUN_DIR`, sealed keys only)
//! and the store key from `ZPREDICT_STORE_KEY`.

use std::path::PathBuf;

use zpredict_oracle::{Chain, Lightwalletd};
use zpredict_settle::{HALF_TICKS_PER_UNIT, MemoKey, Scanner, decode_fvk, store};

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{name} not set; run scripts/scan-e2e.sh"))
}

#[test]
#[ignore = "needs the regtest chain from scripts/scan-e2e.sh"]
fn every_relayer_sees_the_deposit() {
    let run = PathBuf::from(env("RUN_DIR"));
    let tag = hex::decode(env("DEPOSIT_TAG")).unwrap();
    let units: u64 = env("DEPOSIT_UNITS").parse().unwrap();
    let from: u32 = env("DEPOSIT_FROM").parse().unwrap();

    let ufvk = store::open_file(&run.join("frost/escrow-ufvk.sealed"), "ufvk").unwrap();
    let fvk = decode_fvk(std::str::from_utf8(&ufvk).unwrap().trim()).unwrap();
    let lwd = Lightwalletd::new(&env("LWD_URL")).unwrap();
    let tip = lwd.tip().unwrap();

    for relayer in 0..3 {
        let path = run.join(format!("frost/r{relayer}-memo.sealed"));
        let key: [u8; 32] = store::open_file(&path, "memo-key")
            .unwrap()
            .try_into()
            .unwrap();
        let scanner = Scanner::new(&fvk, relayer, MemoKey::from_bytes(key));
        let found = scanner.blocks(&lwd, from, tip).unwrap();
        let deposits: Vec<_> = found.iter().filter_map(|s| s.as_ref().ok()).collect();
        assert_eq!(deposits.len(), 1, "relayer {relayer}: {found:?}");
        let d = deposits[0];
        assert_eq!((d.units, &d.tag[..]), (units, &tag[..]));
        let share = if relayer == 0 {
            units * HALF_TICKS_PER_UNIT
        } else {
            0
        };
        assert_eq!(d.balance_share(relayer), share);
        println!(
            "relayer {relayer}: deposit at height {} action {} -> share {share}",
            d.height, d.note.action
        );
    }
}
