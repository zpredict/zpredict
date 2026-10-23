# zpredict-relayer for r{0,1,2}.zpredict.site. Build context: repo root.
# Targets: the default (last) stage is the relayer; `ceremony` is the key-ceremony and
# escrow-wallet tool image (settle, settle-payout, zcash-devtool, sh, tar).
FROM rust:1.99.1-slim-trixie@sha256:d5928c68f8909c141df1bef47ac2c99c025fc9480d09870e08c3783b270eedec AS rust
# The demo VPS builds this next to live apps; 4 jobs keeps rustc's peak memory in check.
ENV CARGO_BUILD_JOBS=4

# zcash-devtool, pinned like scripts/lib/env.sh (DEVTOOL_REV), with its own Cargo.lock.
# Relayer 0 shells out to it to sync, prove and broadcast escrow payouts.
FROM rust AS devtool
ARG DEVTOOL_REPO=https://github.com/zcash/zcash-devtool.git
ARG DEVTOOL_REV=0b3436bb8d235c67cd36b800cb45a7b1b489c415
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /devtool
# Its rust-toolchain.toml says "stable"; build with the image's toolchain instead.
ENV RUSTUP_TOOLCHAIN=1.99.1
RUN git init -q . && git remote add origin "$DEVTOOL_REPO" \
	&& git fetch -q --depth 1 origin "$DEVTOOL_REV" && git checkout -q FETCH_HEAD \
	&& cargo build --release --locked --features regtest_support \
	&& cp target/release/zcash-devtool /zcash-devtool && rm -rf target

FROM rust AS build
WORKDIR /src
COPY . .
RUN cargo build --release --locked -p zpredict-relayer -p zpredict-settle \
	&& cp target/release/zpredict-relayer target/release/settle target/release/settle-payout / \
	&& mkdir -p /data /wallet

# Key ceremony (deploy/production/ceremony.sh) and the escrow-wallet sidecar for relayer 0.
FROM debian:trixie-slim@sha256:62bd423aeee912639ca8ee681c2b762cb3e25137e0a92b20be455898a9f034ad AS ceremony
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=build /settle /settle-payout /usr/local/bin/
COPY --from=devtool /zcash-devtool /usr/local/bin/
COPY deploy/production/ceremony.sh deploy/production/escrow-wallet.sh /usr/local/bin/
USER 65532:65532

# Only the binaries on distroless (glibc + CA certs, no shell), as uid 65532.
FROM gcr.io/distroless/cc-debian13:nonroot@sha256:83b9b50586253821cf63ffcec87d3d94265a093ad30da232039af962dd8f4edf
COPY --from=build /zpredict-relayer /usr/local/bin/zpredict-relayer
COPY --from=devtool /zcash-devtool /usr/local/bin/zcash-devtool
COPY --from=build --chown=nonroot:nonroot /data /data
COPY --from=build --chown=nonroot:nonroot /wallet /wallet
COPY deploy/production/relayer.toml /etc/zpredict/relayer.toml
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD ["zpredict-relayer", "health", "127.0.0.1:8080"]
ENTRYPOINT ["zpredict-relayer", "/etc/zpredict/relayer.toml"]
