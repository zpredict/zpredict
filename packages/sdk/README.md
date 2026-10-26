# @zpredict/sdk

The browser side of zPredict: order encoding, XOR secret sharing, deposit memos, withdrawals, outcome checks and the relayer client. Used by `apps/web`; no network calls except to the relayers you pass in.

```ts
import { RELAYERS, claimJudge, getFill, newTag, submitOrder } from "@zpredict/sdk";

const tag = newTag();                     // the account secret: keep it in the browser
await claimJudge(RELAYERS, tag);          // testnet demo credit
const o = await submitOrder(RELAYERS, { market: 11, side: 0, price: 60, size: 5, key: tag });
const { status, fill } = await getFill(RELAYERS, o.orderId, o.tokens);
```

- Each relayer gets only its own share, plus a fresh read token, so no single relayer can read an order or fetch another's fill share.
- `verifyOutcome` checks a market's FROST 2-of-3 outcome signature against the group key.
- Build `pnpm --filter @zpredict/sdk build`; test `pnpm --filter @zpredict/sdk test`. Full reference: docs.zpredict.site/docs/sdk.
