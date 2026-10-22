//! INSECURE: parties 1 and 2 send their shares to party 0, which rebuilds everything,
//! runs the plaintext references (`zpredict_core::apply_flows`, `clear_with_balances`,
//! `resolve`) and hands back fresh shares. It mirrors the circuits, so the batch loop
//! can be tested without the MPC's cost. Only for tests and local dev; the binary
//! refuses it unless both the `dev-insecure` feature and `insecure_matcher = true` are set.

use serde::{Deserialize, Serialize};
use zpredict_circuit::{Outcome, Position, Public, Shares, Table};
use zpredict_core::{
    ACCOUNT_LEN, Account, BALANCE_LEN, FILL_LEN, Key, ORDER_LEN, Order, Side, Withdrawal,
    apply_flows, clear_with_balances, fill_records, resolve,
};

use super::Matcher;
use crate::error::Result;
use crate::peers::Links;

pub struct InsecureLocalMatcher;

/// Everything a party holds, as rows of bytes.
#[derive(Default, Serialize, Deserialize)]
struct Held {
    orders: Vec<[u8; ORDER_LEN]>,
    fills: Vec<[u8; FILL_LEN]>,
    accounts: Vec<[u8; ACCOUNT_LEN]>,
    keys: Vec<Key>,
    withdrawals: Vec<Key>,
}

#[derive(Serialize, Deserialize)]
struct Reply {
    fills: Vec<[u8; FILL_LEN]>,
    balances: Vec<[u8; BALANCE_LEN]>,
    prices: Vec<Option<u16>>,
    withdrawn: Vec<bool>,
}

impl Matcher for InsecureLocalMatcher {
    type Pre = ();

    async fn preprocess(&self, _: &Links, _: usize, _: usize) -> Result<()> {
        Ok(())
    }

    async fn clear(
        &self,
        links: &Links,
        public: &Public,
        shares: &Shares<'_>,
        _: Option<()>,
    ) -> Result<Outcome> {
        let held = Held {
            orders: shares.orders.to_vec(),
            accounts: shares.accounts.to_vec(),
            keys: shares.keys.to_vec(),
            withdrawals: shares.withdrawals.to_vec(),
            ..Held::default()
        };
        let r = round(links, held, |all| clear_all(public, all)).await?;
        Ok(Outcome {
            fills: r.fills,
            balances: r.balances,
            prices: r.prices,
            withdrawn: r.withdrawn,
        })
    }

    async fn resolve(
        &self,
        links: &Links,
        market: u32,
        outcome: Side,
        positions: &[Position],
        (accounts, keys): Table<'_>,
    ) -> Result<Vec<[u8; BALANCE_LEN]>> {
        let held = Held {
            orders: positions.iter().map(|p| p.0).collect(),
            fills: positions.iter().map(|p| p.1).collect(),
            accounts: accounts.to_vec(),
            keys: keys.to_vec(),
            ..Held::default()
        };
        let r = round(links, held, |all| {
            let orders = decoded(&all.orders);
            let positions: Vec<_> = orders.into_iter().zip(all.fills.clone()).collect();
            let balances = resolve(market, outcome, &positions, &table(all));
            Reply {
                fills: vec![],
                balances: balances.iter().map(|b| b.to_le_bytes()).collect(),
                prices: vec![],
                withdrawn: vec![],
            }
        })
        .await?;
        Ok(r.balances)
    }
}

/// Parties 1 and 2 send what they hold to party 0, which combines, computes and
/// re-shares the fills and balances.
async fn round(links: &Links, mine: Held, compute: impl FnOnce(&Held) -> Reply) -> Result<Reply> {
    if links.party != 0 {
        links.send(0, &serde_json::to_vec(&mine)?).await?;
        return Ok(serde_json::from_slice(&links.recv(0).await?)?);
    }
    let mut all = mine;
    for p in 1..3 {
        let theirs: Held = serde_json::from_slice(&links.recv(p).await?)?;
        xor_into(&mut all.orders, &theirs.orders);
        xor_into(&mut all.fills, &theirs.fills);
        xor_into(&mut all.accounts, &theirs.accounts);
        xor_into(&mut all.keys, &theirs.keys);
        xor_into(&mut all.withdrawals, &theirs.withdrawals);
    }
    let mut r = compute(&all);
    for p in 1..3 {
        let theirs = Reply {
            fills: reshare(&mut r.fills),
            balances: reshare(&mut r.balances),
            prices: r.prices.clone(),
            withdrawn: r.withdrawn.clone(),
        };
        links.send(p, &serde_json::to_vec(&theirs)?).await?;
    }
    Ok(r)
}

/// Plaintext reference: credits and withdrawals, then `clear_with_balances`.
fn clear_all(public: &Public, all: &Held) -> Reply {
    let orders = decoded(&all.orders);
    let withdrawals: Vec<Withdrawal> = (all.withdrawals.iter().zip(&public.withdrawals))
        .map(|(&key, &amount)| Withdrawal { key, amount })
        .collect();
    let (table, withdrawn) = apply_flows(&table(all), &public.credits, &withdrawals);
    let c = clear_with_balances(&public.markets, &orders, &table);
    Reply {
        fills: fill_records(&orders, &c.fills),
        balances: c.balances.iter().map(|b| b.to_le_bytes()).collect(),
        prices: c.prices,
        withdrawn,
    }
}

fn decoded(orders: &[[u8; ORDER_LEN]]) -> Vec<Order> {
    let dummy = Order {
        market: 0,
        side: Side::Yes,
        price: 1,
        size: 0,
        key: [0; 16],
    };
    orders
        .iter()
        .map(|b| Order::decode(b).unwrap_or(dummy))
        .collect()
}

fn table(all: &Held) -> Vec<Account> {
    let u64_at = |b: &[u8], i: usize| u64::from_le_bytes(b[i..i + 8].try_into().expect("8 bytes"));
    (all.accounts.iter().zip(&all.keys))
        .map(|(b, &key)| Account {
            id: u64_at(b, 0),
            key,
            balance: u64_at(b, 8),
        })
        .collect()
}

fn xor_into<const L: usize>(acc: &mut [[u8; L]], other: &[[u8; L]]) {
    for (a, b) in acc.iter_mut().zip(other) {
        a.iter_mut().zip(b).for_each(|(x, y)| *x ^= y);
    }
}

/// A fresh random share for a peer; `mine` keeps the rest.
fn reshare<const L: usize>(mine: &mut [[u8; L]]) -> Vec<[u8; L]> {
    let mut theirs = vec![[0u8; L]; mine.len()];
    theirs
        .iter_mut()
        .for_each(|s| getrandom::fill(s).expect("os rng"));
    xor_into(mine, &theirs);
    theirs
}
