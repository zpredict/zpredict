#!/usr/bin/env bash
# End to end: pinned tools -> regtest -> FROST DKG -> deposit -> 2-of-3 FROST spend.
# Each step is its own script (runnable alone, in this order) and runs in its own
# process, so a `cd` or variable in one step cannot leak into the next.
#   scripts/frost-e2e.sh            full run on a fresh chain
#   SKIP_BUILD=1 scripts/frost-e2e.sh   reuse already-built tools
#   KEEP=1 scripts/frost-e2e.sh         leave regtest and frostd running afterwards
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
"$here/fund-escrow.sh"
"$here/frost-spend.sh"
log "done: $(grep TXID "$RUN_DIR/escrow.env")"
