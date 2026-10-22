#!/usr/bin/env bash
# End to end for settlement (#10 + #11): regtest -> FROST DKG (key shares sealed as they
# are made) -> two tagged deposits, scanned -> one batched payout to two fresh
# addresses, signed 2-of-3 -> mined. No relayer secret is ever written in clear.
#   scripts/settle-e2e.sh                full run on a fresh chain
#   SKIP_BUILD=1 scripts/settle-e2e.sh   reuse already-built tools
#   KEEP=1 scripts/settle-e2e.sh         leave regtest running afterwards
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
F=$RUN_DIR/frost

DEPOSIT_UNITS="5 5" "$here/fund-escrow.sh"
tip=$(rpc getblockcount '[]' | jq -r .result)
from=$(awk 'NR == 1 {print $3}' "$RUN_DIR/deposits.txt")
log "relayer r0 scans blocks $from..$tip"
"$BIN/settle" scan 0 "$F/escrow-ufvk.sealed" "$F/r0-memo.sealed" "$LWD_URL" "$from" "$tip"

"$here/payout-escrow.sh"

log "no relayer secret in clear"
[ ! -e "$ESCROW" ] || die "escrow wallet left unsealed in $ESCROW"
clear=$(find "$F" -type f ! -name '*.sealed')
[ -z "$clear" ] || die "unsealed files in $F: $clear"
ls "$F" "$ESCROW_SEALED"
log "done: $(grep PAYOUT_TXID "$RUN_DIR/escrow.env")"
