# zpredict-relayer for r{0,1,2}.zpredict.site. Build context: repo root.
FROM rust:1.99.1-slim-trixie@sha256:d5928c68f8909c141df1bef47ac2c99c025fc9480d09870e08c3783b270eedec AS build
# The demo VPS builds this next to live apps; 4 jobs keeps rustc's peak memory in check.
ENV CARGO_BUILD_JOBS=4
WORKDIR /src
COPY . .
RUN cargo build --release --locked -p zpredict-relayer \
	&& cp target/release/zpredict-relayer /zpredict-relayer \
	&& mkdir /data

# Only the binary on distroless (glibc + CA certs, no shell), as uid 65532.
FROM gcr.io/distroless/cc-debian13:nonroot@sha256:83b9b50586253821cf63ffcec87d3d94265a093ad30da232039af962dd8f4edf
COPY --from=build /zpredict-relayer /usr/local/bin/zpredict-relayer
COPY --from=build --chown=nonroot:nonroot /data /data
COPY deploy/production/relayer.toml /etc/zpredict/relayer.toml
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD ["zpredict-relayer", "health", "127.0.0.1:8080"]
ENTRYPOINT ["zpredict-relayer", "/etc/zpredict/relayer.toml"]
