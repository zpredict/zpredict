#!/usr/bin/env bash
# End to end for settlement (#10 + #11): regtest -> FROST DKG -> key shares sealed (the
# frost-client configs that held them in clear are deleted) -> two tagged deposits,
# scanned -> one batched payout to two fresh addresses, signed 2-of-3 -> mined.
#   scripts/settle-e2e.sh                full run on a fresh chain
#   SKIP_BUILD=1 scripts/settle-e2e.sh   reuse already-built tools
#   KEEP=1 scripts/settle-e2e.sh         leave regtest and frostd running afterwards
set -euo pipefail
here=$(dirname "$0")
source "$here/lib/env.sh"

cleanup() {
  [ "${KEEP:-0}" = 1 ] && return
  stop_frostd
  regtest_down
}
trap cleanup EXIT

[ "${SKIP_BUILD:-0}" = 1 ] || "$here/build-tools.sh"
"$here/regtest-up.sh"
"$here/frost-dkg.sh"

F=$RUN_DIR/frost
log "seal FROST key shares, delete the clear frost-client configs"
stop_frostd # signing no longer needs frostd: FROST runs in-process via frost-core
for p in r0 r1 r2; do
  "$BIN/settle-payout" import-share "$F/$p.toml" "$F/$p-share.sealed"
  rm -f "$F/$p.toml"
done

DEPOSIT_UNITS="5 5" "$here/fund-escrow.sh"
tip=$(rpc getblockcount '[]' | jq -r .result)
from=$(awk 'NR == 1 {print $3}' "$RUN_DIR/deposits.txt")
log "relayer r0 scans blocks $from..$tip"
"$BIN/settle" scan 0 "$F/escrow-ufvk.sealed" "$F/r0-memo.sealed" "$LWD_URL" "$from" "$tip"

"$here/payout-escrow.sh"
log "done: $(grep PAYOUT_TXID "$RUN_DIR/escrow.env")"
