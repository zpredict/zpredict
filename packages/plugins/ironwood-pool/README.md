# zpredict-plugin-ironwood-pool

"Will the Ironwood pool hold at least N notes at height H?" Reads the Ironwood note-commitment tree size at the end of block H from the compact block's chain metadata.

Params: `{"minNotes": 900000}`. Available as a resolver; not listed on the hosted demo.

```sh
cargo test -p zpredict-plugin-ironwood-pool
```
