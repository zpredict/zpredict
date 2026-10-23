# zpredict-relayer for r{0,1,2}.zpredict.site. Build context: repo root.
# One image for everything the relayers resource runs (#124): the relayer, relayer 0's
# escrow-wallet sidecar and the key ceremony (entrypoint overrides). A second image that
# no running container uses can be pruned between deploys and break the next one.
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

# debian-slim, not distroless: escrow-wallet.sh and ceremony.sh need bash and tar. Runs
# as uid 65532 like the distroless image did, so the existing volumes keep their owner.
FROM debian:trixie-slim@sha256:62bd423aeee912639ca8ee681c2b762cb3e25137e0a92b20be455898a9f034ad
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=build /zpredict-relayer /settle /settle-payout /usr/local/bin/
COPY --from=devtool /zcash-devtool /usr/local/bin/zcash-devtool
COPY deploy/production/ceremony.sh deploy/production/escrow-wallet.sh /usr/local/bin/
COPY --from=build --chown=65532:65532 /data /data
COPY --from=build --chown=65532:65532 /wallet /wallet
COPY deploy/production/relayer.toml /etc/zpredict/relayer.toml
USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD ["zpredict-relayer", "health", "127.0.0.1:8080"]
ENTRYPOINT ["zpredict-relayer", "/etc/zpredict/relayer.toml"]
