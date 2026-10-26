# @zpredict/docs

The documentation site at https://docs.zpredict.site (Next.js + Fumadocs). Pages are MDX in `content/docs/`; the order is in `content/docs/meta.json`.

```sh
pnpm --filter @zpredict/docs dev     # http://localhost:3002
pnpm --filter @zpredict/docs build   # then the privacy gate: no third-party URLs
pnpm --filter @zpredict/docs test    # internal links + tests
```

- Brand assets are copied in by `scripts/brand.mjs` before dev and build.
- The server logs no requests and sets a per-request CSP with a script nonce (`src/proxy.ts`).
