# Three regtest relayers with settlement on, sourced by the e2e drivers after env.sh,
# regtest-up.sh and frost-dkg.sh. Needs R (run dir), F (sealed DKG output), FROM (first
# escrow block), CLOSE and RESOLVE (market 1); appends the relayer pids to `pids`.
# Also the client helpers the drivers share.
relayers_up() {
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
}

client() { python3 -I "$REPO_ROOT/scripts/lib/relayer_client.py" "$@"; }
# until_ok <seconds> <description> <command...>: retries the command until it succeeds.
until_ok() {
  local t=$1 what=$2
  shift 2
  for _ in $(seq "$t"); do "$@" >/dev/null 2>&1 && return; sleep 1; done
  tail -5 "$R"/r*.log >&2
  die "timed out waiting for $what"
}
is() { [ "$(client "${@:2}")" = "$1" ]; }
