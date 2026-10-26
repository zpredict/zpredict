# zpredict-plugin-nu7-activation

"Will NU7 activate at height H?" YES iff block H's coinbase transaction carries the NU7 consensus branch ID.

Params: `{"activationHeight": 3543405}`. Available as a resolver; not listed on the hosted demo.

```sh
cargo test -p zpredict-plugin-nu7-activation
```
