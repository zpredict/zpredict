# Deploy

| Dir | What |
|---|---|
| `regtest/` | Local Zebra regtest + lightwalletd (`scripts/regtest-up.sh`) |
| `static/` | Caddyfile and build step shared by `apps/landing/Dockerfile` and `apps/web/Dockerfile` |
| `production/` | Hosted demo: relayer image, compose, host nginx |

## Hosted demo

> **Honest caveat.** For the hackathon all three relayers run on **one VM**, so whoever
> runs that VM could read all three shares of every order. The security model (order
> privacy 3-of-3, funds 2-of-3) needs three **independent operators** on separate hosts.
> The demo shows the protocol working, not the trust split.

| URL | Coolify resource (project `zpredict`) | Loopback port |
|---|---|---|
| https://zpredict.site | app `landing` (`apps/landing/Dockerfile`) | 3170 |
| https://app.zpredict.site | app `web` (`apps/web/Dockerfile`) | 3171 |
| https://r0.zpredict.site … r2 | compose `relayers` (`production/compose.yaml`), **pending #47** | 3172–3174 |

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

Coolify UI → resource → **Deployments** → pick an earlier build → **Redeploy** (keeps the old image), or point the resource at an older commit/branch and deploy. Relayer state lives in the volumes `r{0,1,2}-data` and survives redeploys; never delete them while orders are open.

### Relayers (pending #47)

1. Generate three key pairs (`zpredict-relayer keygen rN`) on a trusted machine.
2. Coolify → project `zpredict` → **+ New → Docker Compose** from this repo, compose file `deploy/production/compose.yaml`. It publishes r0/r1/r2 on `127.0.0.1:3172–3174`; set no Coolify domains (host nginx serves them).
3. Secrets, in the resource's **Environment Variables** (never in git): `R0_KEY`, `R1_KEY`, `R2_KEY` (private, hex) and `R0_PUB`, `R1_PUB`, `R2_PUB`. Coolify stores them encrypted; `entrypoint.sh` writes them to a tmpfs and removes the private key from the environment before the relayer starts. FROST key shares and the viewing-key passphrase go in the same place once the signer lands.
4. Deploy, then check `https://rN.zpredict.site/health` (`peers` all `true`). Measure memory over a few batches with `docker stats` and set `mem_limit` (1 GiB placeholder).

lightwalletd is `testnet.zec.rocks:443` (no local Zebra: not enough disk or RAM on this VM). Containers restart `unless-stopped`; Docker's healthcheck polls `/health`.
