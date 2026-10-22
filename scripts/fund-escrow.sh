#!/usr/bin/env bash
# Deposits into the escrow: funder (Ironwood) -> escrow address (Ironwood receiver
# only), one fixed-denomination note per entry of DEPOSIT_UNITS (default "5"), each
# with a fresh account tag encrypted to the three relayers in a 0xFF memo. Mined and
# confirmed, then the watch-only escrow wallet sees the notes. Appends one line per
# deposit, `<units> <tag> <first height to scan>`, to $RUN_DIR/deposits.txt.
# MEMO_FROM=sdk builds the ZIP 321 request with @zpredict/sdk, exactly as the web app
# does (build the sdk first); the default builds the memo with `settle deposit-memo`.
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"
source "$RUN_DIR/escrow.env"
escrow_open
trap escrow_close EXIT

read -ra PKS <<<"$MEMO_PKS"
for units in ${DEPOSIT_UNITS:-5}; do
  zats=$("$BIN/settle" zats "$units")
  tag=$(openssl rand -hex 16)
  if [ "${MEMO_FROM:-settle}" = sdk ]; then
    uri=$(node "$REPO_ROOT/scripts/lib/deposit-uri.mjs" "$ESCROW_ADDRESS" "$units" "$tag" "${PKS[@]}")
  else
    zec=$(printf '%d.%08d' $((zats / 100000000)) $((zats % 100000000)))
    uri="zcash:$ESCROW_ADDRESS?amount=$zec&memo=$("$BIN/settle" deposit-memo "$tag" "${PKS[@]}")"
  fi
  from=$(($(rpc getblockcount '[]' | jq -r .result) + 1))
  log "deposit $units unit(s) = $zats zats to the escrow, tag ${tag:0:8}… (memo from ${MEMO_FROM:-settle})"
  wallet funder pay -i "$IDENTITY" --payment-uri "$uri" \
    --disable-confirmation -s "$LWD" | tee -a "$RUN_DIR/deposit.out" | tail -1
  echo "$units $tag $from" >>"$RUN_DIR/deposits.txt"
  mine 1
  sync_wallet funder
done

# The escrow treats a deposit as untrusted (received from outside): 10 confirmations.
mine 10
sync_wallet escrow
wallet escrow balance | grep -E 'Balance|Ironwood'
