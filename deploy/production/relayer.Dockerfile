# zpredict-relayer for r{0,1,2}.zpredict.site. Build context: repo root.
# PENDING: needs apps/relayer on main (PR #47). Untested until then.
FROM rust:1.99.1-slim-trixie@sha256:d5928c68f8909c141df1bef47ac2c99c025fc9480d09870e08c3783b270eedec AS build
WORKDIR /src
COPY . .
RUN cargo build --release --locked -p zpredict-relayer \
	&& cp target/release/zpredict-relayer /zpredict-relayer

FROM debian:trixie-slim@sha256:62bd423aeee912639ca8ee681c2b762cb3e25137e0a92b20be455898a9f034ad
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
	&& rm -rf /var/lib/apt/lists/* \
	&& useradd -r -u 10001 relayer && mkdir /data && chown relayer /data
COPY --from=build /zpredict-relayer /usr/local/bin/
COPY deploy/production/relayer.toml /etc/zpredict/relayer.toml
COPY deploy/production/entrypoint.sh /usr/local/bin/
USER relayer
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080 && printf "GET /health HTTP/1.0\r\n\r\n" >&3 && head -1 <&3 | grep -q " 200 "'
ENTRYPOINT ["entrypoint.sh"]
