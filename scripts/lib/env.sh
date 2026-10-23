# Shared settings for the escrow scripts. Sourced, not executed.
# Every run writes its state (test wallets, sealed relayer secrets, PCZTs, logs) under
# $RUN_DIR. Nothing in there is ever committed. Relayer secrets are only ever sealed
# there; PRIVACY.md lists exactly what else is on disk.

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-$HOME/.cache/zpredict-target}
TOOLS_DIR=${TOOLS_DIR:-$HOME/.cache/zpredict-tools}
RUN_DIR=${RUN_DIR:-$HOME/.cache/zpredict-run}
BIN=$CARGO_TARGET_DIR/release

# Pinned external tools (see packages/settle/README.md).
DEVTOOL_REPO=https://github.com/zcash/zcash-devtool.git
DEVTOOL_REV=0b3436bb8d235c67cd36b800cb45a7b1b489c415

COMPOSE=(docker compose -f "$REPO_ROOT/deploy/regtest/compose.yaml" -p zpredict-regtest)
HEIGHTS=$REPO_ROOT/deploy/regtest/activation-heights.toml
# NETWORK=test points the DKG/escrow steps at public testnet instead (no mining).
NETWORK=${NETWORK:-regtest}
LWD=127.0.0.1:9067
[ "$NETWORK" = test ] && LWD=zecrocks # devtool alias for testnet.zec.rocks:443 (TLS)
ZEBRA_RPC=http://127.0.0.1:18232
IDENTITY=$RUN_DIR/age.txt
LWD_URL=http://$LWD # the Rust scanner's form of the same lightwalletd

# Relayer secrets (escrow UFVK, memo keys, FROST key packages) are sealed under this
# key, which lives only in the environment. A driver script sources this file first,
# so every step it runs inherits the same key; to run steps by hand, export it once.
export ZPREDICT_STORE_KEY=${ZPREDICT_STORE_KEY:-$(openssl rand -hex 32)}

log() { printf '\n==> %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# zcash-devtool with its tracing noise filtered out (errors still reach stderr).
devtool() { RUST_LOG=${RUST_LOG:-warn} "$BIN/zcash-devtool" "$@"; }
wallet() {
  local w=$1 dir=$RUN_DIR/$1
  shift
  [ "$w" = escrow ] && dir=$ESCROW
  devtool wallet -w "$dir" "$@"
}

# The escrow's zcash-devtool wallet (UFVK, notes, witnesses) is sealed at rest in
# $ESCROW_SEALED and exists in clear only between escrow_open and escrow_close, in
# $ESCROW: tmpfs (/dev/shm) where there is one, else ESCROW_WALLET_DIR or $RUN_DIR.
ESCROW_SEALED=$RUN_DIR/escrow-wallet.sealed
if [ -n "${ESCROW_WALLET_DIR:-}" ]; then ESCROW=$ESCROW_WALLET_DIR
elif [ -d /dev/shm ]; then ESCROW=/dev/shm/zpredict-escrow
else ESCROW=$RUN_DIR/escrow
fi

escrow_open() {
  [ -d "$ESCROW" ] && return
  (umask 077 && mkdir -p "$ESCROW")
  [ -f "$ESCROW_SEALED" ] || return 0 # a new wallet: frost-dkg.sh is about to create it
  "$BIN/settle" open escrow-wallet <"$ESCROW_SEALED" | tar -C "$ESCROW" -xf -
}

escrow_close() {
  [ -d "$ESCROW" ] || return 0
  tar -C "$ESCROW" -cf - . | "$BIN/settle" seal escrow-wallet >"$ESCROW_SEALED.new"
  mv "$ESCROW_SEALED.new" "$ESCROW_SEALED"
  rm -rf "$ESCROW"
}

# Zebra JSON-RPC: rpc <method> <json-params>
rpc() {
  curl -sf -m 300 -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" "$ZEBRA_RPC"
}

# Mines n blocks (to MINER_ADDRESS, set in compose), then waits for lightwalletd.
mine() {
  # Ten at a time: each block solves Equihash, so 110 in one call can outlast rpc's 300 s
  # timeout on a slow CI runner.
  local left=$1 n
  while [ "$left" -gt 0 ]; do
    n=$((left < 10 ? left : 10))
    rpc generate "[$n]" >/dev/null || die "generate failed"
    left=$((left - n))
  done
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


