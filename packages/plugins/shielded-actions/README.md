# zpredict-plugin-shielded-actions

"Will block H contain at least N shielded actions?" Counts Sapling spends and outputs, Orchard actions and Ironwood actions from the compact block at the resolve height. It powers the hourly demo-resolution markets (the relayers' `[rolling]` config).

Params: `{"minActions": 100}`.

```sh
cargo test -p zpredict-plugin-shielded-actions
```
