# Shared settings for the FROST escrow spike scripts. Sourced, not executed.
# Every run writes its state (wallets, FROST configs, PCZTs, logs) under $RUN_DIR.
# Nothing in there is ever committed: it holds regtest seeds and FROST key shares.

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-$HOME/.cache/zpredict-target}
TOOLS_DIR=${TOOLS_DIR:-$HOME/.cache/zpredict-tools}
RUN_DIR=${RUN_DIR:-$HOME/.cache/zpredict-run}
BIN=$CARGO_TARGET_DIR/release

# Pinned external tools (see packages/settle/README.md).
DEVTOOL_REPO=https://github.com/zcash/zcash-devtool.git
DEVTOOL_REV=0b3436bb8d235c67cd36b800cb45a7b1b489c415
FROST_REPO=https://github.com/ZcashFoundation/frost-zcash-demo.git
FROST_REV=53df99c2bd61f7cb60a0d1f634822a76be3799cf

COMPOSE=(docker compose -f "$REPO_ROOT/deploy/regtest/compose.yaml" -p zpredict-regtest)
HEIGHTS=$REPO_ROOT/deploy/regtest/activation-heights.toml
# NETWORK=test points the DKG/escrow steps at public testnet instead (no mining).
NETWORK=${NETWORK:-regtest}
LWD=127.0.0.1:9067
[ "$NETWORK" = test ] && LWD=zecrocks # devtool alias for testnet.zec.rocks:443 (TLS)
ZEBRA_RPC=http://127.0.0.1:18232
FROSTD=localhost:2744
IDENTITY=$RUN_DIR/age.txt

log() { printf '\n==> %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# zcash-devtool with its tracing noise filtered out (errors still reach stderr).
devtool() { RUST_LOG=${RUST_LOG:-warn} "$BIN/zcash-devtool" "$@"; }
wallet() { local w=$1; shift; devtool wallet -w "$RUN_DIR/$w" "$@"; }

# Zebra JSON-RPC: rpc <method> <json-params>
rpc() {
  curl -sf -m 300 -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" "$ZEBRA_RPC"
}

# Mines n blocks (to MINER_ADDRESS, set in compose), then waits for lightwalletd.
mine() {
  rpc generate "[$1]" >/dev/null || die "generate failed"
  local tip
  tip=$(rpc getblockcount '[]' | jq -r .result)
  [ -d "$RUN_DIR/funder" ] || { sleep 3; return; }
  for _ in $(seq 60); do
    [ "$(wallet funder get-info -s "$LWD" | jq -r .chain_tip_height)" -ge "$tip" ] && return
    sleep 1
  done
  die "lightwalletd did not reach height $tip"
}

sync_wallet() { wallet "$1" sync -s "$LWD" >/dev/null; }

# compose.yaml requires MINER_ADDRESS even to tear down; any value works for `down`.
regtest_down() { MINER_ADDRESS=down "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; }

stop_frostd() {
  local pid=$RUN_DIR/frost/frostd.pid
  if [ -f "$pid" ]; then kill "$(cat "$pid")" 2>/dev/null || true; rm -f "$pid"; fi
}
