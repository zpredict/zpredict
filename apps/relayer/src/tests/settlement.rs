//! The money loop with the plaintext matcher: scanned deposits, resolution payouts and
//! withdrawals (the escrow payout itself needs a chain: `scripts/relayer-e2e.sh`).

use zpredict_oracle::{Outcome, Status};

use super::*;
use crate::ledger::WithdrawalStatus;
use crate::mpc::InsecureLocalMatcher;
use crate::state::State;
use crate::store::Event;

fn record<M: Matcher>(r: &[Relayer<M>], to: &[usize], e: impl Fn(usize) -> Event) {
    for &i in to {
        r[i].batcher.state.lock().unwrap().record(e(i)).unwrap();
    }
}

fn state<M: Matcher>(r: &Relayer<M>) -> std::sync::MutexGuard<'_, State> {
    r.batcher.state.lock().unwrap()
}

/// A depositor's account: its memo slots' key shares and a 25-unit deposit that all three
/// relayers scanned, credited by one batch.
async fn deposited<M: Matcher>(r: &[Relayer<M>]) -> Key {
    let mut tag = [0u8; 16];
    getrandom::fill(&mut tag).unwrap();
    let (account, shares) = (account_id(&tag), key_shares(&tag));
    record(r, &[0, 1, 2], |i| Event::Key {
        id: account,
        share: hex::encode(shares[i]),
    });
    record(r, &[0, 1, 2], |_| Event::Deposit {
        note: format!("{}-0", hex::encode(tag)),
        account,
        amount: 5000,
    });
    batch_all(r).await;
    tag
}

#[tokio::test(flavor = "multi_thread")]
async fn deposits_all_three_scanned_are_credited_once() {
    let r = relayers("deposits", 4, || InsecureLocalMatcher, false);
    let tag = [0xab; 16];
    let account = account_id(&tag);
    let shares = key_shares(&tag);
    record(&r, &[0, 1, 2], |i| Event::Key {
        id: account,
        share: hex::encode(shares[i]),
    });
    let deposit = |note: &str| {
        let note = note.to_owned();
        move |_| Event::Deposit {
            note: note.clone(),
            account,
            amount: 1000,
        }
    };
    record(&r, &[0, 1, 2], deposit("aa-0"));
    record(&r, &[0, 1], deposit("bb-1")); // relayer 2's scanner never saw it
    batch_all(&r).await;
    assert_eq!(balance(&r, &tag).await, 1000);
    batch_all(&r).await;
    assert_eq!(
        balance(&r, &tag).await,
        1000,
        "credited once, the unseen one never"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_resolved_market_pays_its_winners_once() {
    let r = relayers("resolve", 4, || InsecureLocalMatcher, false);
    let (a, b) = (funded(&r).await, funded(&r).await);
    let market = state(&r[0]).markets[0].id;
    submit(&r, &id(1), order(market, Side::Yes, 60, 3, a), &[0, 1, 2]).await;
    submit(&r, &id(2), order(market, Side::No, 45, 3, b), &[0, 1, 2]).await;
    batch_all(&r).await;
    assert_eq!(
        (balance(&r, &a).await, balance(&r, &b).await),
        (5000 - 345, 5000 - 255)
    );
    for x in &r {
        let mut s = state(x);
        s.markets[0].status = Status::Resolved;
        s.markets[0].outcome = Some(Outcome::Yes);
    }
    batch_all(&r).await;
    assert_eq!(
        balance(&r, &a).await,
        5000 - 345 + 3 * 200,
        "3 YES contracts win"
    );
    assert_eq!(balance(&r, &b).await, 5000 - 255);
    batch_all(&r).await;
    assert_eq!(balance(&r, &a).await, 5000 - 345 + 600, "paid once");
    assert!(r.iter().all(|x| state(x).ledger.resolved.contains(&market)));
}

/// Regression #85 (PR #87) and #104 (PR #111): a relayer's forged withdrawal and a
/// judge-mode account's own withdrawal are refused; real ones take only what is held.
#[tokio::test(flavor = "multi_thread")]
async fn withdrawals_take_only_what_the_account_holds() {
    let r = relayers("withdraw", 4, || InsecureLocalMatcher, false);
    let a = deposited(&r).await;
    let judge = funded(&r).await;
    // Account a's key as fresh XOR shares, one per relayer: no relayer learns whose
    // withdrawal it is.
    let request = |id: &str, amount, shares: [Key; 3]| {
        let id = id.to_owned();
        move |i: usize| Event::Withdrawal {
            id: id.clone(),
            share: hex::encode(shares[i]),
            amount,
            address: "ua".into(),
        }
    };
    // Relayer 0 impersonating a: it knows a's id and its own key share, so its forged
    // request carries that share and zero shares at the others. The circuit refuses it.
    let forged = [key_shares(&a)[0], [0; 16], [0; 16]];
    record(&r, &[0, 1, 2], request(&id(6), 1000, forged));
    batch_all(&r).await;
    assert_eq!(
        balance(&r, &a).await,
        5000,
        "a relayer cannot spend an account"
    );
    record(&r, &[0, 1, 2], request(&id(7), 3000, fresh_shares(&a)));
    record(&r, &[0, 1, 2], request(&id(8), 2001, fresh_shares(&a))); // 2000 left: refused
    record(&r, &[0, 1], request(&id(9), 10, fresh_shares(&a))); // relayer 2 never got it
    batch_all(&r).await;
    assert_eq!(balance(&r, &a).await, 2000);
    // A judge-mode account's own withdrawal, with its real key: mock credit never pays out.
    record(&r, &[0, 1, 2], request(&id(5), 4000, fresh_shares(&judge)));
    batch_all(&r).await;
    assert_eq!(
        balance(&r, &judge).await,
        5000,
        "mock credit is not withdrawable"
    );
    for x in &r {
        let s = state(x);
        let status = |n| s.ledger.withdrawal(&id(n)).map(|w| w.status);
        assert_eq!(status(5), Some(WithdrawalStatus::Refused));
        assert_eq!(status(6), Some(WithdrawalStatus::Refused));
        assert_eq!(status(7), Some(WithdrawalStatus::Debited));
        assert_eq!(status(8), Some(WithdrawalStatus::Refused));
    }
    assert_eq!(
        state(&r[0]).ledger.withdrawal(&id(9)).unwrap().status,
        WithdrawalStatus::Pending
    );
}

/// Regression #104 (PR #111): a payout round that fails (here relayer 0 has no escrow
/// wallet to build it with) leaves the withdrawal `debited` with `payout: "retrying"`, and
/// never stops the next window from clearing orders or preprocessing the next run.
#[tokio::test(flavor = "multi_thread")]
async fn regression_104_a_failed_payout_never_blocks_clearing_or_preprocessing() {
    let mut r = relayers("payout-fails", 4, || InsecureLocalMatcher, false);
    let shares = zpredict_settle::dkg_local().unwrap();
    let ak = shares[0].ak().unwrap();
    let fvk = zpredict_settle::keys::fvk_from_ak(&ak).unwrap();
    let to = zpredict_settle::escrow_keys(&ak, "regtest")
        .unwrap()
        .address;
    for (i, (x, s)) in r.iter_mut().zip(shares).enumerate() {
        let e = crate::escrow::Escrow::for_tests(i, s, fvk.clone());
        x.batcher.escrow = Some(std::sync::Arc::new(e));
    }
    let a = deposited(&r).await;
    let shares = fresh_shares(&a);
    record(&r, &[0, 1, 2], |i| Event::Withdrawal {
        id: id(7),
        share: hex::encode(shares[i]),
        amount: 1000,
        address: to.clone(),
    });
    batch_all(&r).await; // debits
    assert_eq!(balance(&r, &a).await, 4000);

    // The next window clears its orders, then its payout round fails.
    submit(&r, &id(1), order(1, Side::Yes, 60, 2, a), &[0, 1, 2]).await;
    submit(&r, &id(2), order(1, Side::No, 40, 2, a), &[0, 1, 2]).await;
    assert_eq!(batch_all(&r).await[0], [id(1), id(2)]);
    assert_eq!(fill(&r, &id(1)).await.map(|f| f[9]), Some(1), "filled");
    let (_, w) = call(&r[0].http, "GET", &format!("/withdrawals/{}", id(7)), None).await;
    assert_eq!(w, json!({"status": "debited", "payout": "retrying"}));
    let held = |x: &Relayer<InsecureLocalMatcher>| x.batcher.pre.lock().unwrap().is_some();
    assert!(!held(&r[0]), "that window skipped preprocessing");

    // The one after backs the payout off and preprocesses the next run.
    batch_all(&r).await;
    assert!(r.iter().all(held), "preprocessed");
    let status = state(&r[0]).ledger.withdrawal(&id(7)).map(|w| w.status);
    assert_eq!(
        status,
        Some(WithdrawalStatus::Debited),
        "still owed, never lost"
    );
}
