//! The money loop with the plaintext matcher: scanned deposits, resolution payouts and
//! withdrawals (the escrow payout itself needs a chain: `scripts/relayer-e2e.sh`).

use zpredict_oracle::{Outcome, Status};

use super::*;
use crate::ledger::WithdrawalStatus;
use crate::mpc::InsecureLocalMatcher;
use crate::state::State;
use crate::store::Event;

fn record<M>(r: &[Relayer<M>], to: &[usize], e: impl Fn(usize) -> Event) {
    for &i in to {
        r[i].batcher.state.lock().unwrap().record(e(i)).unwrap();
    }
}

fn state<M>(r: &Relayer<M>) -> std::sync::MutexGuard<'_, State> {
    r.batcher.state.lock().unwrap()
}

#[tokio::test(flavor = "multi_thread")]
async fn deposits_all_three_scanned_are_credited_once() {
    let r = relayers("deposits", 4, || InsecureLocalMatcher, false);
    let tag = "ab".repeat(16);
    let account = tag_account(&tag);
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
    let ((ta, a), (tb, b)) = (funded(&r).await, funded(&r).await);
    let market = state(&r[0]).markets[0].id;
    submit(&r, &id(1), order(market, Side::Yes, 60, 3, a), &[0, 1, 2]).await;
    submit(&r, &id(2), order(market, Side::No, 45, 3, b), &[0, 1, 2]).await;
    batch_all(&r).await;
    assert_eq!(
        (balance(&r, &ta).await, balance(&r, &tb).await),
        (5000 - 345, 5000 - 255)
    );
    for x in &r {
        let mut s = state(x);
        s.markets[0].status = Status::Resolved;
        s.markets[0].outcome = Some(Outcome::Yes);
    }
    batch_all(&r).await;
    assert_eq!(
        balance(&r, &ta).await,
        5000 - 345 + 3 * 200,
        "3 YES contracts win"
    );
    assert_eq!(balance(&r, &tb).await, 5000 - 255);
    batch_all(&r).await;
    assert_eq!(balance(&r, &ta).await, 5000 - 345 + 600, "paid once");
    assert!(r.iter().all(|x| state(x).ledger.resolved.contains(&market)));
}

#[tokio::test(flavor = "multi_thread")]
async fn withdrawals_take_only_what_the_account_holds() {
    let r = relayers("withdraw", 4, || InsecureLocalMatcher, false);
    let (ta, a) = funded(&r).await;
    // Account a as XOR shares, one per relayer: no relayer learns whose withdrawal it is.
    let shares = [[0x11u8; 8], [0x22; 8], {
        let mut s = a.to_le_bytes();
        s.iter_mut().for_each(|b| *b ^= 0x11 ^ 0x22);
        s
    }];
    let request = |id: &str, amount| {
        let id = id.to_owned();
        move |i: usize| Event::Withdrawal {
            id: id.clone(),
            share: hex::encode(shares[i]),
            amount,
            address: "ua".into(),
        }
    };
    record(&r, &[0, 1, 2], request(&id(7), 3000));
    record(&r, &[0, 1, 2], request(&id(8), 2001)); // 5000 - 3000 left: refused
    record(&r, &[0, 1], request(&id(9), 10)); // relayer 2 never got it: waits
    batch_all(&r).await;
    assert_eq!(balance(&r, &ta).await, 2000);
    for x in &r {
        let s = state(x);
        let status = |n| s.ledger.withdrawal(&id(n)).map(|w| w.status);
        assert_eq!(status(7), Some(WithdrawalStatus::Debited));
        assert_eq!(status(8), Some(WithdrawalStatus::Refused));
    }
    assert_eq!(
        state(&r[0]).ledger.withdrawal(&id(9)).unwrap().status,
        WithdrawalStatus::Pending
    );
}
