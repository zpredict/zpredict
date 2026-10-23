#!/usr/bin/env bash
# The faucet (#133) end to end on a fresh regtest chain, through three real relayers:
#   DKG -> relayers scanning the escrow -> the faucet (funder wallet) -> a browser-style
#   memo for a fresh tag, challenge, proof of work, drip -> a second drip is rate limited
#   -> mined (faucet status) -> 10 confirmations -> credited on all three relayers (the
#   account balance combines all three shares, and a deposit is credited only once all
#   three scanners recorded it) -> the drop has no transparent parts.
#   scripts/faucet-e2e.sh                full run
#   SKIP_BUILD=1 scripts/faucet-e2e.sh   reuse built tools
#   KEEP=1 scripts/faucet-e2e.sh         leave regtest, the relayers and the faucet running
set -euo pipefail
here=$(dirname "$0")
source "$here/lib/env.sh"
source "$here/lib/relayers.sh"

R=$RUN_DIR/relayers
F=$RUN_DIR/frost
FAUCET=http://127.0.0.1:4320
BITS=10
pids=()
cleanup() {
  [ "${KEEP:-0}" = 1 ] && return
  for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done
  escrow_close
  regtest_down
}
trap cleanup EXIT

if [ "${SKIP_BUILD:-0}" != 1 ]; then
  "$here/build-tools.sh"
  log "zpredict-relayer, zpredict-faucet"
  cargo build -q --release --locked -p zpredict-relayer -p zpredict-faucet --manifest-path "$REPO_ROOT/Cargo.toml"
fi
"$here/regtest-up.sh"
"$here/frost-dkg.sh"
source "$RUN_DIR/escrow.env"
TIP=$(rpc getblockcount '[]' | jq -r .result)
FROM=$((TIP + 1)) CLOSE=$((TIP + 500)) RESOLVE=$((TIP + 505))
relayers_up

log "the faucet, paying from the funder wallet (Turnstile off on regtest)"
FAUCET_ESCROW_UA=$ESCROW_ADDRESS FAUCET_LISTEN=127.0.0.1:4320 \
  FAUCET_DEVTOOL=$BIN/zcash-devtool FAUCET_WALLET=$RUN_DIR/funder FAUCET_IDENTITY=$IDENTITY \
  FAUCET_SERVER=$LWD FAUCET_POW_BITS=$BITS FAUCET_SYNC_SECS=3 FAUCET_ORIGINS=http://localhost:3000 \
  "$BIN/zpredict-faucet" >"$R/faucet.log" 2>&1 &
pids+=($!)
until_ok 60 "faucet balance" bash -c "curl -sf $FAUCET/status | jq -e .enabled"
curl -sf "$FAUCET/status" | jq -c .

log "a fresh account; its memo built as the browser does (shares encrypted to each relayer)"
read -ra PKS <<<"$MEMO_PKS"
TAG=$(openssl rand -hex 16)
MEMO=$("$BIN/settle" deposit-memo "$TAG" "${PKS[@]}")
drip_body() {
  local c n
  c=$(curl -sf -X POST "$FAUCET/challenge" | jq -r .challenge)
  n=$("$BIN/zpredict-faucet" solve "$c" "$MEMO" "$BITS")
  jq -nc --arg m "$MEMO" --arg c "$c" --argjson n "$n" '{memo: $m, pow: {challenge: $c, nonce: $n}}'
}
TXID=$(curl -sf -X POST -H 'content-type: application/json' -d "$(drip_body)" "$FAUCET/drip" | jq -r .txid)
[ ${#TXID} = 64 ] || die "no txid from the faucet: $(tail -3 "$R/faucet.log")"
echo "drip txid $TXID"

log "a second drip right away is rate limited (one drop per interval, for everyone)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d "$(drip_body)" "$FAUCET/drip")
[ "$code" = 429 ] || die "second drip: HTTP $code, expected 429"

log "mined, then credited once all three relayers scanned it (10 confirmations)"
mine 1
until_ok 60 "faucet sees the drop mined" bash -c "curl -sf '$FAUCET/status?tx=$TXID' | jq -e '.tx.mined != null'"
mine 10
until_ok 240 "1 unit credited" is 200 balance "$TAG"
echo "account balance 200 half-ticks (1 unit)"

TX=$(rpc getrawtransaction "[\"$TXID\", 1]")
[ "$(jq -r '(.result.vin | length) + (.result.vout | length)' <<<"$TX")" = 0 ] || die "transparent parts"
log "done: faucet drip $TXID credited to a fresh account on all three relayers"
