# zpredict.site: Astro static build served by Caddy. Build context: repo root.
#   docker build -f apps/landing/Dockerfile .
FROM node:24.19.0-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build
ENV HUSKY=0 ASTRO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @zpredict/landing... \
	&& pnpm --filter @zpredict/landing build \
	&& node deploy/static/prepare.mjs apps/landing/dist /csp.caddy

FROM caddy:2.11.7-alpine@sha256:24ec7b05bc532c7bb57f727030c5056e257ff7138b4b50460306819ff79362bd
COPY deploy/static/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /csp.caddy /etc/caddy/csp.caddy
COPY --from=build /repo/apps/landing/dist /srv
# Caddy keeps nothing on disk here; point its state dirs somewhere nobody can write.
ENV XDG_CONFIG_HOME=/tmp XDG_DATA_HOME=/tmp
USER nobody
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
