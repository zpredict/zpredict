# zpredict-faucet for faucet.zpredict.site (#133). Build context: repo root.
FROM rust:1.99.1-slim-trixie@sha256:d5928c68f8909c141df1bef47ac2c99c025fc9480d09870e08c3783b270eedec AS rust
# The demo VPS builds this next to live apps; 4 jobs keeps rustc's peak memory in check.
ENV CARGO_BUILD_JOBS=4

# zcash-devtool exactly as in relayer.Dockerfile (same instructions, so BuildKit reuses
# that stage's cache): the faucet shells out to it to sync and pay.
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
RUN cargo build --release --locked -p zpredict-faucet && cp target/release/zpredict-faucet /

# Binaries only, on distroless (glibc + CA certs, no shell). The wallet is a bind mount
# owned by the VPS user, so compose sets that uid.
FROM gcr.io/distroless/cc-debian13:nonroot@sha256:83b9b50586253821cf63ffcec87d3d94265a093ad30da232039af962dd8f4edf
COPY --from=build /zpredict-faucet /usr/local/bin/zpredict-faucet
COPY --from=devtool /zcash-devtool /usr/local/bin/zcash-devtool
EXPOSE 8080
ENTRYPOINT ["zpredict-faucet"]
