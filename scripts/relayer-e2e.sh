#!/usr/bin/env bash
# The money loop end to end on a fresh regtest chain, through three real relayers
# (3-party MPC over Noise, settlement on):
#   DKG (sealed) -> two 25-unit tagged deposits -> each relayer scans them, credited once
#   all three agree -> a YES and a NO order cross -> the market resolves on every node ->
#   the resolution MPC pays the winner -> the winner withdraws to a fresh address ->
#   relayers 0 and 1 verify-then-sign one batched payout -> mined -> the payee holds it.
#   scripts/relayer-e2e.sh                full run
#   SKIP_BUILD=1 scripts/relayer-e2e.sh   reuse built tools
#   KEEP=1 scripts/relayer-e2e.sh         leave regtest and the relayers running
set -euo pipefail
here=$(dirname "$0")
source "$here/lib/env.sh"

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

log "three relayers (keys, configs; escrow wallet open for relayer 0, the prover)"
mkdir -p "$R"
for i in 0 1 2; do "$BIN/zpredict-relayer" keygen "$R/r$i" >/dev/null; done
escrow_open
for i in 0 1 2; do
  prover=""
  [ "$i" = 0 ] && prover="devtool = \"$BIN/zcash-devtool\"
wallet_dir = \"$ESCROW\"
devtool_server = \"$LWD\""
  cat >"$R/r$i.toml" <<EOF
index = $i
network = "regtest"
listen = "127.0.0.1:430$((i + 1))"
peers = ["127.0.0.1:4311", "127.0.0.1:4312", "127.0.0.1:4313"]
key_file = "r$i.key"
peer_keys = ["r0.pub", "r1.pub", "r2.pub"]
web_origin = "http://localhost:3000"
oracle_lightwalletd = "$LWD_URL"
escrow_lightwalletd = "$LWD_URL"
batch_size = 8
table_rows = 8
window_secs = 6
expire_batches = 3
data_dir = "data/r$i"

[settlement]
network = "regtest"
ufvk = "$F/escrow-ufvk.sealed"
memo_key = "$F/r$i-memo.sealed"
key_share = "$F/r$i-share.sealed"
start_height = $FROM
$prover

[[markets]]
id = 1
question = "Will regtest block $RESOLVE hold at least 0 shielded actions?"
plugin = "shielded-actions"
params = { minActions = 0 }
closeHeight = $CLOSE
resolveHeight = $RESOLVE
status = "open"
EOF
  "$BIN/zpredict-relayer" "$R/r$i.toml" >"$R/r$i.log" 2>&1 &
  pids+=($!)
done
export RELAYERS="http://127.0.0.1:4301 http://127.0.0.1:4302 http://127.0.0.1:4303"
client() { python3 -I "$REPO_ROOT/scripts/lib/relayer_client.py" "$@"; }
# until <seconds> <description> <command...>: retries the command until it succeeds.
until_ok() {
  local t=$1 what=$2
  shift 2
  for _ in $(seq "$t"); do "$@" >/dev/null 2>&1 && return; sleep 1; done
  tail -5 "$R"/r*.log >&2
  die "timed out waiting for $what"
}
is() { [ "$(client "${@:2}")" = "$1" ]; }

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

log "A withdraws everything to a fresh shielded address"
wallet payee init --name payee -i "$IDENTITY" -n regtest --activation-heights "$HEIGHTS" -s "$LWD" >/dev/null
UA=$(wallet payee generate-address -p orchard 2>&1 | grep -o 'uregtest1[a-z0-9]*' | head -1)
W=$(client withdraw "$TAG_A" 5850 "$UA")
until_ok 300 "payout broadcast" bash -c "[ \"\$(python3 -I '$REPO_ROOT/scripts/lib/relayer_client.py' withdrawal $W | cut -d' ' -f1)\" = paid ]"
read -r _ TXID <<<"$(client withdrawal "$W")"
is 0 balance "$TAG_A" || die "A after withdrawal: $(client balance "$TAG_A")"
mine 1
TX=$(rpc getrawtransaction "[\"$TXID\", 1]")
echo "txid $TXID  version $(jq -r .result.version <<<"$TX")  ironwood actions $(jq -r '.result.ironwood.actions | length' <<<"$TX")  transparent in+out $(jq -r '(.result.vin | length) + (.result.vout | length)' <<<"$TX")"
[ "$(jq -r '(.result.vin | length) + (.result.vout | length)' <<<"$TX")" = 0 ] || die "transparent parts"
sync_wallet payee
wallet payee balance | grep -E 'Balance:'
wallet payee balance | grep -q '0.29240000' || die "payee did not receive (5850 - 2) x 5000 zats"

log "no relayer secret in clear"
clear=$(find "$F" -type f ! -name '*.sealed')
[ -z "$clear" ] || die "unsealed files in $F: $clear"
log "done: deposit -> trade -> resolution -> withdrawal $TXID"
