# zpredict-relayer for r{0,1,2}.zpredict.site. Build context: repo root.
# CI builds and pushes it (.github/workflows/relayer-image.yml); the VPS only pulls.
# cargo-chef splits dependency compilation into its own layer, so the GitHub Actions
# layer cache skips it unless Cargo.lock or a manifest changed.
FROM rust:1.91.1-slim-trixie@sha256:f75071363e7f4771769d4cf81b1b7b290e607f4d4459e8731f6abdcee9982dc8 AS chef
RUN cargo install cargo-chef --locked --version 0.1.78
WORKDIR /src

FROM chef AS plan
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS build
COPY --from=plan /src/recipe.json recipe.json
RUN cargo chef cook --release --locked -p zpredict-relayer --recipe-path recipe.json
COPY . .
RUN cargo build --release --locked -p zpredict-relayer \
	&& cp target/release/zpredict-relayer /zpredict-relayer \
	&& mkdir /data

# Only the binary on distroless (glibc + CA certs, no shell), as uid 65532.
FROM gcr.io/distroless/cc-debian13:nonroot@sha256:83b9b50586253821cf63ffcec87d3d94265a093ad30da232039af962dd8f4edf
COPY --from=build /zpredict-relayer /usr/local/bin/zpredict-relayer
COPY --from=build --chown=nonroot:nonroot /data /data
COPY deploy/production/relayer.toml /etc/zpredict/relayer.toml
# Served as /health.version so a deploy can wait for all three relayers to run it.
ARG RELAYER_VERSION=dev
ENV RELAYER_VERSION=$RELAYER_VERSION
LABEL org.opencontainers.image.source=https://github.com/zpredict/zpredict
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD ["zpredict-relayer", "health", "127.0.0.1:8080"]
ENTRYPOINT ["zpredict-relayer", "/etc/zpredict/relayer.toml"]
