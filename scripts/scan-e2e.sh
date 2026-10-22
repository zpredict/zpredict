#!/usr/bin/env bash
# End to end for escrow scanning (#10): regtest -> FROST DKG (sealed UFVK + memo keys)
# -> one tagged 5-unit deposit -> each relayer scans the escrow and credits (A, 0, 0).
# Runs the ignored regtest test in packages/settle against the live chain.
#   scripts/scan-e2e.sh                 full run on a fresh chain
#   SKIP_BUILD=1 scripts/scan-e2e.sh    reuse already-built tools
#   KEEP=1 scripts/scan-e2e.sh          leave regtest running afterwards
set -euo pipefail
here=$(dirname "$0")
source "$here/lib/env.sh"

cleanup() {
  [ "${KEEP:-0}" = 1 ] && return
  regtest_down
}
trap cleanup EXIT

[ "${SKIP_BUILD:-0}" = 1 ] || "$here/build-tools.sh"
"$here/regtest-up.sh"
"$here/frost-dkg.sh"
DEPOSIT_UNITS=5 "$here/fund-escrow.sh"

read -r units tag from <"$RUN_DIR/deposits.txt"
tip=$(rpc getblockcount '[]' | jq -r .result)
F=$RUN_DIR/frost
for r in 0 1 2; do
  log "relayer r$r scans blocks $from..$tip"
  "$BIN/settle" scan "$r" "$F/escrow-ufvk.sealed" "$F/r$r-memo.sealed" "$LWD_URL" "$from" "$tip"
done

log "regtest scan test"
RUN_DIR=$RUN_DIR LWD_URL=$LWD_URL DEPOSIT_TAG=$tag DEPOSIT_UNITS=$units DEPOSIT_FROM=$from \
  cargo test -q -p zpredict-settle --manifest-path "$REPO_ROOT/Cargo.toml" \
  --test regtest_scan -- --ignored --nocapture
