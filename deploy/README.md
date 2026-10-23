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

Request path: browser → Cloudflare (proxied) → host nginx on the VPS (TLS, `production/nginx.conf`) → container on `127.0.0.1:<port>`. Coolify builds the images on the VPS from this repo; nothing is pushed to a registry.

**Privacy:** the static sites are Caddy with no `log` directive; host nginx has `access_log off`, `error_log /dev/null` and forwards no client IP. Each image's CSP is self-only: inline scripts and styles are allowed by sha256 hash computed at build (`static/prepare.mjs`), and the web app's `connect-src` adds exactly the three relayer origins from `NEXT_PUBLIC_RELAYERS`. Cloudflare still sees visitor IPs; that is outside this repo.

### DNS (Cloudflare, proxied, all A → VPS)

`zpredict.site`, `app`, `r0`, `r1`, `r2`. Cloudflare SSL mode Full or Full (strict): the origin has a Let's Encrypt cert for all five names.

### Deploy / redeploy

- Coolify UI → project `zpredict` → resource → **Deploy** (or `POST /api/v1/deploy {"uuid":"<uuid>"}`). Each resource builds from `github.com/zpredict/zpredict`, branch `main`.
- Relayer URLs for the web app are a build arg (`NEXT_PUBLIC_RELAYERS`, default `https://r{0,1,2}.zpredict.site`); changing them means a rebuild, and the CSP follows automatically.
- Host nginx: edit `production/nginx.conf`, then on the VPS `sudo tee /etc/nginx/sites-available/zpredict.site < nginx.conf && sudo nginx -t && sudo systemctl reload nginx`.
- TLS: `certbot certonly --webroot -w ~/acme --config-dir ~/le/config … --cert-name zpredict.site -d …` (user-level certbot). The existing cron `certbot renew` renews it.

### Rollback

Coolify UI → resource → **Deployments** → pick an earlier build → **Redeploy** (keeps the old image), or point the resource at an older commit/branch and deploy. The relayers share one `zpredict-relayer:local` tag, so their rollback is a redeploy of an older commit (a rebuild, ~3.5 min). Relayer state lives in the volumes `r{0,1,2}-data` and survives redeploys; never delete them while orders are open.

### Relayers

`production/compose.yaml` runs three containers from one image (`production/relayer.Dockerfile`: `cargo build --release` on the VPS, then only the binary on distroless `cc-debian13:nonroot`). They share `production/relayer.toml`; `ZPREDICT_INDEX` picks the party, and judge mode (testnet) is on for all three: each registers the account's key share, and relayer 0 credits the demo amount. MPC traffic runs on the internal `peers` network (static IPs, Noise KK). Each party has its own volume `r{0,1,2}-data` for its event log.

- **Secrets:** Coolify → `relayers` → Environment Variables: `R0_KEY`, `R1_KEY`, `R2_KEY` (Noise private keys, hex) and `R0_PUB`, `R1_PUB`, `R2_PUB`. Compose mounts them as files under `/run/secrets` (so the private key never sits in a container's environment); Coolify stores them encrypted. New keys: `zpredict-relayer keygen rN` (or any X25519 pair), replace all six, redeploy. Outcome signing (#77) turns on after the key ceremony (#78): copy each sealed `rN-share.sealed` into that relayer's volume as `/data/frost-share.sealed` and set `ZPREDICT_FROST_SHARE_FILE=/data/frost-share.sealed` and `ZPREDICT_STORE_KEY` for each service. Until then `/group-key` answers 404 and outcomes show as "Resolved (unsigned)".
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
- **Markets:** the three headline markets (NU7 activation, Ironwood ≥ 900k notes, ≥ 5 shielded actions) plus one hourly rolling market (`[rolling]` in `relayer.toml`): 3 + 1 = 4, what one MPC run clears. The generator never opens a market past that cap; a fifth open market would need a second run per window and slow every judge's fill.
- **Build** takes about 3.5 min on the VPS (`CARGO_BUILD_JOBS=4` keeps rustc's memory down; r1/r2 reuse r0's image). Each build leaves several GB of BuildKit cache; the host's cron runs `docker builder prune -af` every 6 h, so after many redeploys in a row run it by hand and keep > 10 GB free.

lightwalletd: the oracle reads mainnet (`zec.rocks:443`), the escrow testnet (`testnet.zec.rocks:443`). No local Zebra: not enough disk or RAM on this VM.
