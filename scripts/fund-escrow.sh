#!/usr/bin/env bash
# Deposits into the escrow: funder (Ironwood) -> escrow address (Ironwood receiver
# only), mined and confirmed, then the watch-only escrow wallet sees the note.
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"
source "$RUN_DIR/escrow.env"

AMOUNT=${DEPOSIT_ZATS:-500000000} # 5 ZEC: one fixed-denomination deposit

log "deposit $AMOUNT zats to the escrow"
wallet funder send -i "$IDENTITY" --address "$ESCROW_ADDRESS" --value "$AMOUNT" -s "$LWD" |
  tee "$RUN_DIR/deposit.out" | tail -1

# The escrow treats the deposit as untrusted (received from outside): 10 confirmations.
mine 11
sync_wallet escrow
wallet escrow balance | grep -E 'Balance|Ironwood'
