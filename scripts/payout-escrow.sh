#!/usr/bin/env bash
# One batched payout from the escrow to two fresh shielded addresses, signed 2-of-3
# (r0 + r1; r2 offline) with every signer checking the PCZT against the payout vector:
#   settle-payout create     one PCZT: a payout per winner, change to escrow, ZIP 317, wallet padding
#   devtool pczt prove       on the prover relayer, in the background (off the signing path)
#   settle-payout sign       one FROST session for all spends; each signer verifies first
#   devtool pczt combine -> pczt send, then checks the mined tx: v6, Ironwood only
# A tampered payout vector must be refused before anything is signed.
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"

F=$RUN_DIR/frost
S=$RUN_DIR/payout
escrow_open
trap escrow_close EXIT
rm -rf "$S" "$RUN_DIR"/winner-*
mkdir -p "$S"

log "two fresh shielded winner addresses"
: >"$S/payouts.txt"
i=0
for zats in ${PAYOUT_ZATS:-3000000 4000000}; do
  w=winner-$i
  wallet "$w" init --name "$w" -i "$IDENTITY" -n regtest --activation-heights "$HEIGHTS" -s "$LWD" >/dev/null
  ua=$(wallet "$w" generate-address -p orchard 2>&1 | grep -o 'uregtest1[a-z0-9]*' | head -1)
  echo "$ua $zats" >>"$S/payouts.txt"
  i=$((i + 1))
done
cat "$S/payouts.txt"

log "PCZT for $(wc -l <"$S/payouts.txt" | tr -d ' ') payouts"
sync_wallet escrow
"$BIN/settle-payout" create regtest "$ESCROW" "$S/payouts.txt" >"$S/created.pczt"
devtool pczt -w "$ESCROW" prove <"$S/created.pczt" >"$S/proven.pczt" 2>"$S/prove.log" &
prover=$!

log "a tampered payout vector is refused"
awk '{print $1, $2 + 1}' "$S/payouts.txt" >"$S/tampered.txt"
if "$BIN/settle-payout" sign regtest "$S/tampered.txt" "$F/escrow-ufvk.sealed" \
  "$F/r0-share.sealed" "$F/r1-share.sealed" <"$S/created.pczt" >/dev/null 2>"$S/tampered.log"; then
  die "signers accepted a PCZT that does not match their payout vector"
fi
cat "$S/tampered.log"

log "FROST 2-of-3, one session for every spend (r0, r1; r2 offline)"
"$BIN/settle-payout" sign regtest "$S/payouts.txt" "$F/escrow-ufvk.sealed" \
  "$F/r0-share.sealed" "$F/r1-share.sealed" <"$S/created.pczt" >"$S/signed.pczt"

wait "$prover" || die "prover failed, see $S/prove.log"
log "combine, broadcast"
devtool pczt combine -i "$S/signed.pczt" -i "$S/proven.pczt" >"$S/final.pczt"
devtool pczt -w "$ESCROW" send -s "$LWD" <"$S/final.pczt" | tee "$S/send.out"
TXID=$(grep -oE '[0-9a-f]{64}' "$S/send.out" | tail -1)
[ -n "$TXID" ] || die "no txid from pczt send"

mine 1
TX=$(rpc getrawtransaction "[\"$TXID\", 1]")
echo "$TX" >"$S/tx.json"
VERSION=$(jq -r .result.version <<<"$TX")
HEIGHT=$(jq -r .result.height <<<"$TX")
IRONWOOD=$(jq -r '.result.ironwood.actions | length' <<<"$TX")
ORCHARD=$(jq -r '(.result.orchard.actions // []) | length' <<<"$TX")
TRANSPARENT=$(jq -r '(.result.vin | length) + (.result.vout | length)' <<<"$TX")
echo "txid $TXID  version $VERSION  height $HEIGHT  ironwood actions $IRONWOOD  orchard actions $ORCHARD  transparent in+out $TRANSPARENT"
[ "$VERSION" = 6 ] || die "expected a v6 transaction"
[ "$HEIGHT" != null ] || die "transaction not mined"
[ "$IRONWOOD" -ge 2 ] || die "expected a padded Ironwood bundle"
[ "$ORCHARD$TRANSPARENT" = 00 ] || die "Orchard or transparent parts present"

for ((j = 0; j < i; j++)); do
  sync_wallet "winner-$j"
  echo "winner-$j: $(wallet "winner-$j" balance | grep -E 'Balance:')"
done
echo "PAYOUT_TXID=$TXID" >>"$RUN_DIR/escrow.env"
