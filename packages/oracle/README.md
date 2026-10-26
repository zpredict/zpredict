# zpredict-oracle

Market resolution. A `Market` names a plugin; the plugin is a `Resolver` that reads a `Chain` and returns a `Resolution` with the block it used, so anyone can recompute the outcome on their own node. Mirrored markets carry the outside oracle and its market id instead (`Evidence`).

- `Registry`: plugin name → resolver.
- `Lightwalletd`: the `Chain` backend for compact blocks.
- `FixtureChain`: an in-memory chain for plugin tests.
- An outcome counts only after `CONFIRMATIONS` blocks on top. The relayers sign it 2-of-3 with FROST (`apps/relayer`).

```sh
cargo test -p zpredict-oracle
```
