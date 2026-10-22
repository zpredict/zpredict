//! INSECURE: parties 1 and 2 send their shares to party 0, which rebuilds every order
//! and table row, clears one market with `zpredict_core::clear_with_balances` and hands
//! back fresh shares. It mirrors the circuit (markets, credits, prices), so the
//! batch loop can be tested without the MPC's cost. Only for tests and local dev;
//! the binary refuses it unless both the `dev-insecure` feature and
//! `insecure_matcher = true` are set.

use serde::{Deserialize, Serialize};
use zpredict_core::{
    ACCOUNT_LEN, Account, BALANCE_LEN, FILL_LEN, ORDER_LEN, Order, Side, clear_with_balances,
    fill_records,
};

use super::{Cleared, Matcher};
use crate::error::Result;
use crate::peers::Links;

pub struct InsecureLocalMatcher;

#[derive(Serialize, Deserialize)]
struct Shares {
    orders: Vec<[u8; ORDER_LEN]>,
    accounts: Vec<[u8; ACCOUNT_LEN]>,
}

#[derive(Serialize, Deserialize)]
struct Reply {
    fills: Vec<[u8; FILL_LEN]>,
    balances: Vec<[u8; BALANCE_LEN]>,
    prices: Vec<Option<u16>>,
}

impl Matcher for InsecureLocalMatcher {
    async fn clear(
        &self,
        links: &Links,
        markets: &[u32],
        credits: &[u64],
        orders: &[[u8; ORDER_LEN]],
        accounts: &[[u8; ACCOUNT_LEN]],
    ) -> Result<Cleared> {
        let mine = Shares {
            orders: orders.to_vec(),
            accounts: accounts.to_vec(),
        };
        if links.party != 0 {
            links.send(0, &serde_json::to_vec(&mine)?).await?;
            let r: Reply = serde_json::from_slice(&links.recv(0).await?)?;
            return Ok(Cleared {
                fills: r.fills,
                balances: r.balances,
                prices: r.prices,
            });
        }
        let mut all = mine;
        for p in 1..3 {
            let theirs: Shares = serde_json::from_slice(&links.recv(p).await?)?;
            xor_into(&mut all.orders, &theirs.orders);
            xor_into(&mut all.accounts, &theirs.accounts);
        }
        let Reply {
            mut fills,
            mut balances,
            prices,
        } = clear_markets(markets, credits, &all);
        for p in 1..3 {
            let r = Reply {
                fills: reshare(&mut fills),
                balances: reshare(&mut balances),
                prices: prices.clone(),
            };
            links.send(p, &serde_json::to_vec(&r)?).await?;
        }
        Ok(Cleared {
            fills,
            balances,
            prices,
        })
    }
}

/// Plaintext reference: credits first, then `clear_with_balances` (malformed orders
/// are dummies).
fn clear_markets(markets: &[u32], credits: &[u64], s: &Shares) -> Reply {
    let dummy = Order {
        market: 0,
        side: Side::Yes,
        price: 1,
        size: 0,
        account: 0,
    };
    let orders: Vec<Order> = (s.orders.iter())
        .map(|b| Order::decode(b).unwrap_or(dummy))
        .collect();
    let u64_at = |b: &[u8], i: usize| u64::from_le_bytes(b[i..i + 8].try_into().expect("8 bytes"));
    let accounts: Vec<Account> = (s.accounts.iter().zip(credits))
        .map(|(b, c)| Account {
            id: u64_at(b, 0),
            balance: u64_at(b, 8) + c,
        })
        .collect();
    let c = clear_with_balances(markets, &orders, &accounts);
    let balances = c.balances.iter().map(|b| b.to_le_bytes()).collect();
    Reply {
        fills: fill_records(&orders, &c.fills),
        balances,
        prices: c.prices,
    }
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
