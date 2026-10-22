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

- **Automatic:** a push to `main` runs `.github/workflows/deploy.yml`: CI, then only what changed. Static paths (`apps/landing|web`, `packages/sdk|brand`, `deploy/static`, pnpm files) redeploy the Coolify uuids in the `production` variable `COOLIFY_RESOURCES`. Relayer paths (`apps/relayer`, `packages/core|circuit|oracle|plugins|settle`, `Cargo.*`, `deploy/production/compose.yaml|relayer.*`) build the relayer image in CI (`relayer-image.yml`, GHA layer cache, pushed to `ghcr.io/zpredict/zpredict-relayer:<commit>` and `:main`), redeploy `COOLIFY_RELAYERS`, and then wait until all three `/health` report that commit as `version` with every peer connected. The token is the deploy-only secret `COOLIFY_TOKEN`.
- **Manual:** Actions → Deploy → Run workflow (deploys everything), or Coolify UI → project `zpredict` → resource → **Deploy**. The static sites build from `main` on the VPS; the relayers pull `:main`.
- **Judging (Oct 29 – Nov 22):** avoid merging relayer-path changes unless needed; every relayer deploy restarts all three (seconds of 502, then a window until peers reconnect).
- Relayer URLs for the web app are a build arg (`NEXT_PUBLIC_RELAYERS`, default `https://r{0,1,2}.zpredict.site`); changing them means a rebuild, and the CSP follows automatically.
- Host nginx: edit `production/nginx.conf`, then on the VPS `sudo tee /etc/nginx/sites-available/zpredict.site < nginx.conf && sudo nginx -t && sudo systemctl reload nginx`.
- TLS: `certbot certonly --webroot -w ~/acme --config-dir ~/le/config … --cert-name zpredict.site -d …` (user-level certbot). The existing cron `certbot renew` renews it.

### Rollback

Static sites: Coolify UI → resource → **Deployments** → pick an earlier build → **Redeploy** (keeps the old image). Relayers: set `RELAYER_TAG=<commit>` in the `relayers` resource's environment variables and redeploy (pulls that image from GHCR, no build); delete the variable to follow `:main` again. Relayer state lives in the volumes `r{0,1,2}-data` and survives redeploys; never delete them while orders are open.

### Relayers

`production/compose.yaml` runs three containers from one image (`production/relayer.Dockerfile`: built in CI with cargo-chef so dependencies stay cached, then only the binary on distroless `cc-debian13:nonroot`; the VPS pulls it from GHCR). They share `production/relayer.toml`; `ZPREDICT_INDEX` picks the party, and judge mode is served by relayer 0 only (testnet). MPC traffic runs on the internal `peers` network (static IPs, Noise KK). Each party has its own volume `r{0,1,2}-data` for its event log.

- **Secrets:** Coolify → `relayers` → Environment Variables: `R0_KEY`, `R1_KEY`, `R2_KEY` (Noise private keys, hex) and `R0_PUB`, `R1_PUB`, `R2_PUB`. Compose mounts them as files under `/run/secrets` (so the private key never sits in a container's environment); Coolify stores them encrypted. New keys: `zpredict-relayer keygen rN` (or any X25519 pair), replace all six, redeploy. FROST key shares and the viewing-key passphrase go in the same place once the signer lands.
- **Health:** `https://rN.zpredict.site/health` (`peers` all `true` once a batch has run, `version` = image commit); the Docker healthcheck runs `zpredict-relayer health 127.0.0.1:8080` (the image has no shell). `restart: unless-stopped`.
- **Measured** on the VPS (8 slots, 32 table rows, three markets in one multi-market MPC run, two crossing judge orders): one batch ≈ 23 s at about one core per party; peak RSS r0 496 MiB, r1 303 MiB, r2 354 MiB; ~15–55 MiB idle. Order to fill in the browser: 35 s. So `window_secs = 25` (batch + 2) and caps r0 768 MiB, r1/r2 512 MiB. If the host gets tight, raise `window_secs` rather than lowering the caps.
- **Markets:** keep the deployed list to the three demo markets (NU7 activation, Ironwood ≥ 900k notes, ≥ 5 shielded actions). One MPC run clears up to 4 markets; a fifth would need a second run per window and slow every judge's fill.
- **Build:** CI only; the VPS no longer compiles Rust, so a relayer deploy is an image pull plus a restart.

lightwalletd: the oracle reads mainnet (`zec.rocks:443`), the escrow testnet (`testnet.zec.rocks:443`). No local Zebra: not enough disk or RAM on this VM.
