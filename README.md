# zPredict

[![CI](https://github.com/zpredict/zpredict/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/zpredict/zpredict/actions/workflows/deploy.yml)

Shielded prediction market on Zcash. Nobody learns that you bet, which side, or how much.

FROST 2-of-3 escrow · orders secret-shared across 3 relayers · YES/NO matched in MPC · batched Ironwood payouts.

Design and threat model: [DESIGN.md](DESIGN.md).

```sh
cargo test
```

MIT · Built for [Zecathon 2026](https://thezecathon.com/).
