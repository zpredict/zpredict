# docs.zpredict.site: Next.js standalone server (search, llms.txt, .md routes, per-request
# CSP nonce). Build context: repo root.
#   docker build -f apps/docs/Dockerfile .
FROM node:24.19.0-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build
ENV HUSKY=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @zpredict/docs... \
	&& pnpm --filter @zpredict/docs build

FROM node:24.19.0-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
WORKDIR /app
# The standalone bundle keeps the monorepo layout; static files and public/ are served by it.
COPY --from=build /repo/apps/docs/.next/standalone ./
COPY --from=build /repo/apps/docs/.next/static ./apps/docs/.next/static
COPY --from=build /repo/apps/docs/public ./apps/docs/public
# Read-only for the server: it writes nothing (no logs to disk, no cache it needs).
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
	CMD node -e "fetch('http://127.0.0.1:8080/robots.txt').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/docs/server.js"]
