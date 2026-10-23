#!/usr/bin/env bash
# The money loop end to end on a fresh regtest chain, through three real relayers
# (3-party MPC over Noise, settlement on):
#   DKG (sealed) -> two 25-unit tagged deposits -> each relayer scans them, credited once
#   all three agree -> a YES and a NO order cross -> the market resolves on every node ->
#   the resolution MPC pays the winner -> each relayer's forged withdrawal for the winner
#   is refused -> the winner withdraws to a fresh address ->
#   relayers 0 and 1 verify-then-sign one batched payout -> mined -> the payee holds it.
#   scripts/relayer-e2e.sh                full run
#   SKIP_BUILD=1 scripts/relayer-e2e.sh   reuse built tools
#   KEEP=1 scripts/relayer-e2e.sh         leave regtest and the relayers running
set -euo pipefail
here=$(dirname "$0")
source "$here/lib/env.sh"
source "$here/lib/relayers.sh"

R=$RUN_DIR/relayers
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
  log "zpredict-relayer"
  cargo build -q --release --locked -p zpredict-relayer --manifest-path "$REPO_ROOT/Cargo.toml"
fi
"$here/regtest-up.sh"
"$here/frost-dkg.sh"
DEPOSIT_UNITS="25 25" "$here/fund-escrow.sh"
read -r _ TAG_A FROM <<<"$(sed -n 1p "$RUN_DIR/deposits.txt")"
read -r _ TAG_B _ <<<"$(sed -n 2p "$RUN_DIR/deposits.txt")"
F=$RUN_DIR/frost
TIP=$(rpc getblockcount '[]' | jq -r .result)
CLOSE=$((TIP + 20)) RESOLVE=$((TIP + 25))

relayers_up

log "deposits: credited once all three relayers scanned them"
until_ok 240 "deposit A" is 5000 balance "$TAG_A"
until_ok 60 "deposit B" is 5000 balance "$TAG_B"
echo "A 5000, B 5000 half-ticks (25 units each)"

log "YES 60 x10 (A) crosses NO 45 x10 (B) at 0.575"
YES=$(client order "$TAG_A" 1 yes 60 10)
NO=$(client order "$TAG_B" 1 no 45 10)
until_ok 120 "fills" is "10 1150 0 1" fill "$YES"
is "10 850 1 1" fill "$NO" || die "NO fill: $(client fill "$NO")"
is 3850 balance "$TAG_A" || die "A after fill: $(client balance "$TAG_A")"

log "mine past the resolve height; every node resolves YES; the MPC pays A"
mine $((RESOLVE - TIP + 10))
until_ok 120 "outcome" is yes outcome 1
until_ok 120 "payout into A's row" is 5850 balance "$TAG_A"
# The same key shares sign the outcome (FROST 2-of-3, #77) now that settlement is on.
until_ok 60 "signed outcome" bash -c "curl -sf http://127.0.0.1:4301/markets | jq -e '.[0].outcomeSig'"
is 4150 balance "$TAG_B" || die "B after resolution: $(client balance "$TAG_B")"
echo "A 5850 (3850 + 10 contracts x 1 unit), B 4150"

wallet payee init --name payee -i "$IDENTITY" -n regtest --activation-heights "$HEIGHTS" -s "$LWD" >/dev/null
UA=$(wallet payee generate-address -p orchard 2>&1 | grep -o 'uregtest1[a-z0-9]*' | head -1)
for p in 0 1 2; do
  log "relayer $p impersonates A (its key share + A's id) to withdraw everything: refused"
  F_W=$(client forge "$TAG_A" "$p" 5850 "$UA")
  until_ok 120 "forged withdrawal $p settled" bash -c "[ \"\$(python3 -I '$REPO_ROOT/scripts/lib/relayer_client.py' withdrawal $F_W | cut -d' ' -f1)\" = refused ]"
done
is 5850 balance "$TAG_A" || die "A after forged withdrawals: $(client balance "$TAG_A")"

log "A withdraws everything to a fresh shielded address"
W=$(client withdraw "$TAG_A" 5850 "$UA")
until_ok 300 "payout broadcast" bash -c "[ \"\$(python3 -I '$REPO_ROOT/scripts/lib/relayer_client.py' withdrawal $W | cut -d' ' -f1)\" = paid ]"
read -r _ TXID <<<"$(client withdrawal "$W")"
is 0 balance "$TAG_A" || die "A after withdrawal: $(client balance "$TAG_A")"
mine 1
TX=$(rpc getrawtransaction "[\"$TXID\", 1]")
echo "txid $TXID  version $(jq -r .result.version <<<"$TX")  ironwood actions $(jq -r '.result.ironwood.actions | length' <<<"$TX")  transparent in+out $(jq -r '(.result.vin | length) + (.result.vout | length)' <<<"$TX")"
[ "$(jq -r '(.result.vin | length) + (.result.vout | length)' <<<"$TX")" = 0 ] || die "transparent parts"
sync_wallet payee
# Read once: `grep -q` closing the pipe early made devtool panic on EPIPE, failing pipefail.
BAL=$(wallet payee balance)
grep -E 'Balance:' <<<"$BAL"
grep -q '0.29240000' <<<"$BAL" || die "payee did not receive (5850 - 2) x 5000 zats"

log "no relayer secret in clear"
clear=$(find "$F" -type f ! -name '*.sealed')
[ -z "$clear" ] || die "unsealed files in $F: $clear"
log "done: deposit -> trade -> resolution -> withdrawal $TXID"
