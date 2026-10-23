# Deploy

| Dir | What |
|---|---|
| `regtest/` | Local Zebra regtest + lightwalletd (`scripts/regtest-up.sh`) |
| `static/` | Caddyfile and build step shared by `apps/landing/Dockerfile` and `apps/web/Dockerfile` |
| `production/` | Hosted demo: relayer image, compose, config, host nginx |

## Hosted demo

> **Honest caveat.** For the hackathon all three relayers run on **one VM**, so whoever
> runs that VM could read all three shares of every order. The security model (order
> privacy 3-of-3, funds 2-of-3) needs three **independent operators** on separate hosts.
> The demo shows the protocol working, not the trust split.

| URL | Coolify resource (project `zpredict`) | Loopback port |
|---|---|---|
| https://zpredict.site | app `landing` (`apps/landing/Dockerfile`) | 3170 |
| https://app.zpredict.site | app `web` (`apps/web/Dockerfile`) | 3171 |
| https://r0.zpredict.site … r2 | compose `relayers` (`production/compose.yaml`) | 3172–3174 |
| https://docs.zpredict.site | app `docs` (`apps/docs/Dockerfile`, Next standalone server) | 3175 |
| https://faucet.zpredict.site (DNS-only, not proxied) | compose `faucet` (`production/faucet.compose.yaml`) | 3176 |

Request path: browser → Cloudflare (proxied) → host nginx on the VPS (TLS, `production/nginx.conf`) → container on `127.0.0.1:<port>`. Coolify builds the images on the VPS from this repo; nothing is pushed to a registry.

**Privacy:** the static sites are Caddy with no `log` directive, and the docs server logs no requests; host nginx has `access_log off`, `error_log /dev/null` and forwards no client IP. Each image's CSP is self-only: inline scripts and styles are allowed by sha256 hash computed at build (`static/prepare.mjs`), and the web app's `connect-src` adds exactly the three relayer origins from `NEXT_PUBLIC_RELAYERS`. The docs server sets its CSP per request with a script nonce (`apps/docs/src/proxy.ts`). Cloudflare still sees visitor IPs; that is outside this repo.

### DNS (Cloudflare, proxied, all A → VPS)

`zpredict.site`, `app`, `r0`, `r1`, `r2`, `docs`. Cloudflare SSL mode Full or Full (strict): the origin has a Let's Encrypt cert for all six names.

### Deploy / redeploy

- Coolify UI → project `zpredict` → resource → **Deploy** (or `POST /api/v1/deploy {"uuid":"<uuid>"}`). Each resource builds from `github.com/zpredict/zpredict`, branch `main`.
- Relayer URLs for the web app are a build arg (`NEXT_PUBLIC_RELAYERS`, default `https://r{0,1,2}.zpredict.site`); changing them means a rebuild, and the CSP follows automatically.
- Host nginx: edit `production/nginx.conf`, then on the VPS `sudo tee /etc/nginx/sites-available/zpredict.site < nginx.conf && sudo nginx -t && sudo systemctl reload nginx`.
- TLS: `certbot certonly --webroot -w ~/acme --config-dir ~/le/config … --cert-name zpredict.site -d …` (user-level certbot). The existing cron `certbot renew` renews it.

### Rollback

Coolify UI → resource → **Deployments** → pick an earlier build → **Redeploy** (keeps the old image), or point the resource at an older commit/branch and deploy. The relayers share one `zpredict-relayer:local` tag, so their rollback is a redeploy of an older commit (a rebuild, ~3.5 min). Relayer state lives in the volumes `r{0,1,2}-data` and survives redeploys; never delete them while orders are open.

### Relayers

`production/compose.yaml` runs three containers from one image (`production/relayer.Dockerfile`: `cargo build --release` on the VPS, then only the binary on distroless `cc-debian13:nonroot`). They share `production/relayer.toml`; `ZPREDICT_INDEX` picks the party, and judge mode (testnet) is on for all three: each registers the account's key share, and relayer 0 credits the demo amount. MPC traffic runs on the internal `peers` network (static IPs, Noise KK). Each party has its own volume `r{0,1,2}-data` for its event log.

- **Secrets:** Coolify → `relayers` → Environment Variables: `R0_KEY`, `R1_KEY`, `R2_KEY` (Noise private keys, hex) and `R0_PUB`, `R1_PUB`, `R2_PUB`. Compose mounts them as files under `/run/secrets` (so the private key never sits in a container's environment); Coolify stores them encrypted. New keys: `zpredict-relayer keygen rN` (or any X25519 pair), replace all six, redeploy. `R0_STORE_KEY`, `R1_STORE_KEY`, `R2_STORE_KEY` (64 hex, one per relayer, never shared) open that relayer's sealed escrow secrets; they are the only copy, so losing one means re-running the ceremony (below).
- **Health:** `https://rN.zpredict.site/health` (`peers` all `true` once a batch has run); the Docker healthcheck runs `zpredict-relayer health 127.0.0.1:8080` (the image has no shell). `restart: unless-stopped`.
- **Measured** on the VPS (8 slots, 32 table rows, account keys, four markets in one multi-market MPC run, two crossing judge orders, 2026-10-22): one batch ≈ 37 s at about one core per party; peak RSS r0 694 MiB, r1 421 MiB, r2 389 MiB. Order to fill in the browser: 62–65 s with a 27 s window (each batch overran it, so batches ran every 54 s). That needed `window_secs = 39` (batch + 2); caps r0 1 GiB, r1/r2 640 MiB.
- **Preprocessing ahead (#94).** 92% of a clearing run is polytune's input-independent preprocessing (M4 Pro, 32 rows: 5.7 s of 6.2 s). The relayers keep one preprocessed run ready, so a window with orders only runs the ~0.5 s online part (~3 s on the VPS, scaled by the measured 37 s / 6.2 s), and `window_secs = 5` (idle windows are a hello). Expected fill on the VPS: ~7 s when a run is ready (window/2 + online + hello), up to ~36 s when an order lands right after another batch, while the next run preprocesses. Measured on an M4 Pro with three real relayers and crossing judge orders at random times: before, 10.9 s average with an 8 s window (× 5.7 ≈ 62 s, matching the live 62–65 s); now 2.1 s when a run is ready and 6.4 s for orders placed right after a fill. Peak RSS (Linux, `VmHWM`) r0 783, r1 436, r2 439 MiB: unchanged within the caps; a held run keeps ~260 MiB resident between batches (r1). Re-measure on the VPS after the deploy. If fills must be faster back to back, `table_rows = 16` cuts preprocessing by a third (only if the live table has ≤ 16 rows, since rows are never reclaimed, #64).
- **Account capacity (#99).** Each Judge-mode browser takes one table row (one account per browser, reused from `localStorage`; a half-failed claim is retried with the same tag), deposits take one per depositor, and rows are never reclaimed (#64). The demo runs `table_rows = 48`. Measured on an M4 Pro (three processes, 8 slots, 4 markets):

  | rows | AND gates | preprocessing | online | compile | peak RSS r0 / r1 / r2 (Linux) |
  |---|---|---|---|---|---|
  | 32 | 290,543 | 5.7 s | 0.45–0.53 s | 6.5 s | 728 / 423 / 473 MiB |
  | 48 | 385,321 | 8.0 s | 0.61–0.77 s | 17 s | 1,061–1,092 / 537–559 / 578–586 MiB |
  | 64 | 480,287 | 10.0 s | 0.78–0.97 s | 28 s | 1,285 / 798 / 842 MiB |

  On the VPS (×5.7) 48 rows means ~8 s to a fill with a run ready and up to ~50 s back to back (64 rows: ~9 s and ~63 s, ~160 s to compile), so caps r0 1.25 GiB and r1/r2 768 MiB. The compile now runs on the batch thread, so HTTP and the health check are up meanwhile. Relayer 0 logs `table: N of 48 rows used at startup` (from its event log, before the compile) and `table: N of 48 rows used, W accounts waiting` whenever it changes (operator log only: `docker logs r0 | grep table:`); at 48, Judge mode answers "table full" (`503`) and the web app says so, and a depositor whose row is past the cap sees that their orders can't fill yet. If the log nears 48 during judging, raise `table_rows` (more memory and slower back-to-back fills) or, on testnet, start from a fresh data volume.
- **Markets:** NU7 activation and Ironwood ≥ 900k notes, three mirrored Polymarket markets on the US midterms (#114), plus one hourly rolling market (`[rolling]` in `relayer.toml`): 5 + 1 = 6, what one MPC run clears (`DEFAULT_MARKETS`, raised from 4 for ~+3% preprocessing, DESIGN.md "Market capacity"). The generator never opens a market past that cap; a seventh open market would need a second run per window and slow every judge's fill. The relayers fetch public data from `gamma-api.polymarket.com` and `clob.polymarket.com` (outbound HTTPS from the VPS).
- **Build** takes about 3.5 min on the VPS (`CARGO_BUILD_JOBS=4` keeps rustc's memory down; r1/r2 reuse r0's image). Each build leaves several GB of BuildKit cache; the host's cron runs `docker builder prune -af` every 6 h, so after many redeploys in a row run it by hand and keep > 10 GB free.

### Testnet faucet (#133)

`apps/faucet` sends one 1-unit (0.01 TAZ) shielded deposit to the escrow per drip, with a memo the browser built for its own account at `app.zpredict.site/faucet/` (the faucet never sees the tag). API at `https://faucet.zpredict.site`: `GET /status`, `POST /challenge`, `POST /drip`; a static page at `/`.

- **Wallet:** the demo zcash-devtool wallet on the VPS, `~/.cache/zpredict-demo-wallet` (`wallet/`, and `age.txt`, the age identity its mnemonic is encrypted to), bind-mounted into the container as uid 1001. Testnet only; the identity sits on the VPS disk (mode 600) because devtool needs it to sign. Fund it by sending TAZ to its address (`zcash-devtool wallet -w wallet generate-address`).
- **Anti-abuse:** Cloudflare Turnstile (secret `TURNSTILE_SECRET_KEY` in Coolify → `faucet` → Environment Variables; the public site key is the `NEXT_PUBLIC_TURNSTILE_SITE_KEY` build arg of the web image), a hashcash proof of work, one drop per 30 s globally and 100 a day (`FAUCET_*` in `apps/faucet/src/main.rs`). No per-IP state; logs carry no request data.
- **CSP:** the app allows `https://challenges.cloudflare.com` (script, frame, connect) on `/faucet/` only (`static/prepare.mjs` writes a per-path header) and `https://faucet.zpredict.site` in `connect-src`.
- **Regtest:** `scripts/faucet-e2e.sh` (drip → mined → credited on all three relayers).

### Key ceremony and testnet escrow (#78)

Ran once on 2026-10-23 on the VPS, inside a throwaway container of the relayer image (`production/relayer.Dockerfile`, which also carries settle, settle-payout and zcash-devtool; until #124 this was a separate `ceremony` target), with `/work` on tmpfs and the three relayer volumes mounted. `production/ceremony.sh`:

1. `settle-payout dkg test`: 2-of-3 FROST (RedPallas) DKG; shares and the escrow UFVK are sealed as they are made, under a key that lives only in that process.
2. Reseals each relayer's share and the UFVK under that relayer's own store key (read from stdin, also stored as the Coolify secret `RN_STORE_KEY`) into its volume, `/data/escrow/{share,ufvk}.sealed`; makes one memo key per relayer (`memo.sealed`, public half `memo.pub`, served at `/memo-key`).
3. Creates relayer 0's watch-only zcash-devtool wallet against `testnet.zec.rocks`, born at the tip (4,530,716, = `start_height`), seals it under r0's key (`escrow-wallet.sealed`) and wipes `/work`.

Plaintext keys only ever existed in that container's memory, its tmpfs and pipes (the UFVK is briefly on zcash-devtool's command line inside it). At runtime the `escrow-wallet` sidecar opens r0's wallet into a tmpfs volume; nothing secret is on disk unsealed.

- **Escrow address (testnet, public):** `utest18yg3cneyjgxxknjm0j9020hmx5jp2wm67qn2p3rfmflct9hwlt363gzl50qeu3ms2u044hq8jzuzkl2tq8xa4m0ukzvlpqgtvu96ffyy`, baked into the web build (`NEXT_PUBLIC_ESCROW_UA` in `apps/web/Dockerfile`). FROST group key (`ak`): `a0cff44d86411e03d1ae3a76982d38bf0aac73db9568a2496324167486dbc534`, served by all three at `/group-key`.
- **Re-run:** on the VPS, with the `zpredict-relayer:local` image the relayers run, pipe three fresh store keys (set the same values as `R{0,1,2}_STORE_KEY` in Coolify first) into `docker run --rm -i --user 65532:65532 --tmpfs /work:mode=0700,uid=65532,size=64m -v <uuid>_r0-data:/r0 -v …r1… -v …r2… --entrypoint ceremony.sh zpredict-relayer:local`. It refuses to overwrite an existing `/rN/escrow`.
- **Lost share or store key / rotation:** 2-of-3 still signs with one share lost, but the next step is a new ceremony: move `/data/escrow` aside in all three volumes, run the ceremony (new escrow address and group key), rebuild web with the new address, then have the old group sweep the old escrow's notes to the new address with one payout (2 of the old shares). Outcomes signed by the old group stay verifiable against the old group key. Losing two shares (or two store keys) loses the escrow funds: on testnet that is the accepted risk; a mainnet deployment needs per-operator backups.

lightwalletd: the oracle reads mainnet (`zec.rocks:443`), the escrow testnet (`testnet.zec.rocks:443`). No local Zebra: not enough disk or RAM on this VM.
