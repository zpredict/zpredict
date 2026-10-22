#!/usr/bin/env bash
# Three local relayers on :4101-4103 (peers on :4201-4203), real polytune MPC.
# INSECURE=1 uses the plaintext dev matcher instead (relayer 0 sees every order).
# Keys go to config/keys/ and state to config/data/ (both gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."

features=()
if [ "${INSECURE:-0}" = 1 ]; then
	features=(--features dev-insecure)
	export ZPREDICT_INSECURE_MATCHER=true
fi
cargo build -q -p zpredict-relayer ${features[@]+"${features[@]}"}
bin="${CARGO_TARGET_DIR:-../../target}/debug/zpredict-relayer"

mkdir -p config/keys
for i in 0 1 2; do
	[ -f "config/keys/r$i.key" ] || "$bin" keygen "config/keys/r$i" >/dev/null
done

trap 'kill 0' EXIT
for i in 0 1 2; do
	"$bin" "config/r$i.toml" &
done
wait
