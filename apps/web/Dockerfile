# app.zpredict.site: Next.js static export served by Caddy. Build context: repo root.
#   docker build -f apps/web/Dockerfile [--build-arg NEXT_PUBLIC_RELAYERS=a,b,c] .
FROM node:24.19.0-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build
ARG NEXT_PUBLIC_RELAYERS=https://r0.zpredict.site,https://r1.zpredict.site,https://r2.zpredict.site
ENV HUSKY=0 NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_RELAYERS=$NEXT_PUBLIC_RELAYERS
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @zpredict/web... \
	&& pnpm --filter @zpredict/web build \
	&& node deploy/static/prepare.mjs apps/web/out /csp.caddy "$NEXT_PUBLIC_RELAYERS"

FROM caddy:2.11.7-alpine@sha256:24ec7b05bc532c7bb57f727030c5056e257ff7138b4b50460306819ff79362bd
COPY deploy/static/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /csp.caddy /etc/caddy/csp.caddy
COPY --from=build /repo/apps/web/out /srv
# Caddy keeps nothing on disk here; point its state dirs somewhere nobody can write.
ENV XDG_CONFIG_HOME=/tmp XDG_DATA_HOME=/tmp
USER nobody
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
