#!/usr/bin/env bash
# Builds the pinned toolchain: zcash-devtool (regtest support) and this repo's settle
# binaries. Each is built with its own Cargo.lock (--locked).
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"

checkout() { # <repo> <rev> <dir>
  [ -d "$3/.git" ] || git clone -q "$1" "$3"
  git -C "$3" fetch -q origin "$2"
  git -C "$3" checkout -q "$2"
}

mkdir -p "$TOOLS_DIR"
log "zcash-devtool @ ${DEVTOOL_REV:0:7}"
checkout "$DEVTOOL_REPO" "$DEVTOOL_REV" "$TOOLS_DIR/zcash-devtool"
cargo build -q --release --locked --features regtest_support \
  --manifest-path "$TOOLS_DIR/zcash-devtool/Cargo.toml"

log "settle, settle-payout (packages/settle)"
cargo build -q --release --locked -p zpredict-settle --manifest-path "$REPO_ROOT/Cargo.toml"
