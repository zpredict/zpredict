# zpredict-circuit

Batch clearing as a 3-party MPC: a Garble circuit (`src/clear.garble.rs`) run with polytune. Each relayer feeds its XOR shares of the orders and the balance table; only the fills, new balance shares and one public clearing price per market come out. `src/resolve.garble.rs` pays out positions when a market resolves.

- Sizes: 8 order slots, 24 market slots, any number of table rows (production: 48).
- Preprocessing needs no inputs, so relayers run it ahead of the batch.
- Tested against `zpredict-core`'s plaintext rule.

```sh
cargo test -p zpredict-circuit
cargo run --release -p zpredict-circuit --example bench 1 48 8   # 3 local parties: rows 48, slots 8
```
