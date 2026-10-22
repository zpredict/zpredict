#!/usr/bin/env bash
# Spends from the escrow with a 2-of-3 FROST signature (r0 + r1; r2 offline) to a
# fresh shielded-only address, then checks the mined transaction is v6 with an
# Ironwood bundle. Flow:
#   devtool pczt create -> pczt prove           (any relayer; needs only the viewing key)
#   frost-pczt sighash                          (sighash + one randomizer per spend)
#   frost-client coordinator + 2 participants   (rerandomized RedPallas FROST via frostd)
#   frost-pczt apply -> devtool pczt combine -> pczt send
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"
source "$RUN_DIR/escrow.env"
export SSL_CERT_FILE=$RUN_DIR/frost/ca.pem

AMOUNT=${PAYOUT_ZATS:-200000000}
S=$RUN_DIR/spend
F=$RUN_DIR/frost
rm -rf "$S" "$RUN_DIR/payee"
mkdir -p "$S"

log "fresh shielded payee address"
wallet payee init --name payee -i "$IDENTITY" -n regtest --activation-heights "$HEIGHTS" -s "$LWD" >/dev/null
PAYEE=$(wallet payee generate-address -p orchard 2>&1 | grep -o 'uregtest1[a-z0-9]*' | head -1)
echo "$PAYEE"

log "PCZT: escrow -> payee, $AMOUNT zats"
wallet escrow sync -s "$LWD" >/dev/null
devtool pczt -w "$RUN_DIR/escrow" create --address "$PAYEE" --value "$AMOUNT" >"$S/created.pczt"
devtool pczt -w "$RUN_DIR/escrow" prove <"$S/created.pczt" >"$S/proven.pczt"

"$BIN/frost-pczt" sighash <"$S/created.pczt" | tee "$S/sighash.txt"
SIGHASH=$(awk '/^sighash/{print $2}' "$S/sighash.txt")

# One FROST session per spend: message = sighash, randomizer = the spend's alpha.
# ponytail: one session per spend; frost-client takes several -m/-r pairs if batching matters.
pubkey() { awk '/^Public Key:/{print $3}' "$F/$1.contact"; }
SIGS=()
while read -r _ pool index alpha; do
  log "FROST 2-of-3 for $pool spend #$index (signers r0, r1)"
  printf '%s' "$SIGHASH" | xxd -r -p >"$S/msg-$index.bin"
  printf '%s' "$alpha" | xxd -r -p >"$S/alpha-$index.bin"
  "$BIN/frost-client" coordinator -c "$F/r0.toml" -s "$FROSTD" -g "$GROUP" \
    -S "$(pubkey r0),$(pubkey r1)" -m "$S/msg-$index.bin" -r "$S/alpha-$index.bin" \
    -o - >"$S/coordinator-$index.log" 2>&1 &
  coord=$!
  sleep 2
  # Each participant is shown the message and must answer y. In zPredict a relayer
  # answers y only if the sighash matches the PCZT it recomputed itself.
  for p in r0 r1; do
    echo y | "$BIN/frost-client" participant -c "$F/$p.toml" -s "$FROSTD" -g "$GROUP" \
      >"$S/participant-$p-$index.log" 2>&1 &
  done
  wait "$coord" || die "coordinator failed, see $S/coordinator-$index.log"
  wait
  sig=$(grep -oE '^[0-9a-f]{128}$' "$S/coordinator-$index.log" | tail -1)
  [ -n "$sig" ] || die "no signature in $S/coordinator-$index.log"
  SIGS+=("$pool:$index:$sig")
done < <(grep '^randomizer' "$S/sighash.txt")

log "apply ${#SIGS[@]} signature(s), combine, broadcast"
"$BIN/frost-pczt" apply "${SIGS[@]}" <"$S/created.pczt" >"$S/signed.pczt"
devtool pczt combine -i "$S/signed.pczt" -i "$S/proven.pczt" >"$S/final.pczt"
devtool pczt -w "$RUN_DIR/escrow" send -s "$LWD" <"$S/final.pczt" | tee "$S/send.out"
TXID=$(grep -oE '[0-9a-f]{64}' "$S/send.out" | tail -1)
[ -n "$TXID" ] || die "no txid from pczt send"

mine 1
TX=$(rpc getrawtransaction "[\"$TXID\", 1]")
echo "$TX" >"$S/tx.json"
VERSION=$(jq -r .result.version <<<"$TX")
HEIGHT=$(jq -r .result.height <<<"$TX")
IRONWOOD=$(jq -r '.result.ironwood.actions | length' <<<"$TX")
TRANSPARENT=$(jq -r '(.result.vin | length) + (.result.vout | length)' <<<"$TX")
echo "txid $TXID  version $VERSION  height $HEIGHT  ironwood actions $IRONWOOD  transparent in+out $TRANSPARENT"
[ "$VERSION" = 6 ] || die "expected a v6 transaction"
[ "$HEIGHT" != null ] || die "transaction not mined"
[ "$IRONWOOD" -gt 0 ] || die "no Ironwood bundle"
[ "$TRANSPARENT" = 0 ] || die "transparent inputs or outputs present"

sync_wallet payee
sync_wallet escrow
wallet payee balance | grep -E 'Balance|Ironwood'
echo "TXID=$TXID" >>"$RUN_DIR/escrow.env"
