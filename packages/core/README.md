# zpredict-core

The plaintext reference for zPredict's clearing: order encoding, XOR shares, the clearing rule, balances and settlement. The MPC circuit (`packages/circuit`) is tested against it, so the two must agree bit for bit.

- `Order`, `split` / `combine`: the 26-byte order and its three XOR shares.
- `clear`, `clearing_price`: cross YES/NO in a batch at the midpoint.
- `clear_with_balances`, `worst_case_cost`: the same, with balance checks.
- `apply_flows`, `resolve`: deposits, withdrawals and payouts at resolution.

```sh
cargo test -p zpredict-core
```
