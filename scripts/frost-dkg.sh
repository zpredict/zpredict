#!/usr/bin/env bash
# Runs a 2-of-3 FROST DKG (RedPallas) between three relayers through a local frostd,
# derives the escrow viewing key and Ironwood address from the group key, and imports
# the viewing key into a watch-only "escrow" wallet. No single party ever holds the
# spending key. Writes $RUN_DIR/escrow.env (group key, address, memo public keys); the
# UFVK and each relayer's memo key are sealed under ZPREDICT_STORE_KEY, never in clear.
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"

F=$RUN_DIR/frost
PARTIES=(r0 r1 r2)
mkdir -p "$F"
cd "$F"

# frostd only speaks HTTPS. A throwaway local CA signs a localhost certificate, and
# frost-client trusts it through SSL_CERT_FILE (rustls-native-certs honours it).
log "TLS for frostd"
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 2 \
  -subj /CN=zpredict-regtest-ca -keyout ca.key -out ca.pem 2>/dev/null
openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -subj /CN=localhost \
  -keyout tls.key -out tls.csr 2>/dev/null
printf 'subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n' >ext.cnf
openssl x509 -req -in tls.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 2 \
  -extfile ext.cnf -out tls.pem 2>/dev/null
export SSL_CERT_FILE=$F/ca.pem

stop_frostd
"$BIN/frostd" -i 127.0.0.1 -p 2744 -c tls.pem -k tls.key >frostd.log 2>&1 &
echo $! >frostd.pid
sleep 1

log "relayer identities ${PARTIES[*]}"
for p in "${PARTIES[@]}"; do
  "$BIN/frost-client" init -c "$p.toml" >/dev/null 2>&1
  "$BIN/frost-client" export --name "$p" -c "$p.toml" >"$p.contact" 2>&1
done
pubkey() { awk '/^Public Key:/{print $3}' "$1.contact"; }
for p in "${PARTIES[@]}"; do
  for q in "${PARTIES[@]}"; do
    [ "$p" = "$q" ] && continue
    "$BIN/frost-client" import -c "$p.toml" "$(grep -o 'zffrost1[a-z0-9]*' "$q.contact")" >/dev/null 2>&1
  done
done

log "DKG 2-of-3 (redpallas)"
dkg() { "$BIN/frost-client" dkg -c "$1.toml" -d zpredict-escrow -s "$FROSTD" -t 2 -C redpallas "${@:2}"; }
dkg r0 -S "$(pubkey r1),$(pubkey r2)" >dkg-r0.log 2>&1 &
pids=($!)
sleep 2
for p in r1 r2; do dkg "$p" >"dkg-$p.log" 2>&1 & pids+=($!); done
wait "${pids[@]}" || die "DKG failed, see $F/dkg-*.log"

GROUP=$("$BIN/frost-client" groups -c r0.toml 2>&1 | awk '/^Public key/{print $3}')
[ -n "$GROUP" ] || die "no FROST group"
read -r UFVK ADDRESS < <("$BIN/frost-pczt" ufvk "$GROUP" "$NETWORK" | awk '{print $2}' | paste -sd' ' -)
printf %s "$UFVK" | "$BIN/settle" seal ufvk >escrow-ufvk.sealed
MEMO_PKS=()
for p in "${PARTIES[@]}"; do
  MEMO_PKS+=("$("$BIN/settle" memo-key "$p-memo.sealed" | awk '{print $2}')")
done
printf 'GROUP=%s\nESCROW_ADDRESS=%s\nMEMO_PKS="%s"\n' "$GROUP" "$ADDRESS" "${MEMO_PKS[*]}" >"$RUN_DIR/escrow.env"
echo "group key (ak): $GROUP"
echo "escrow address: $ADDRESS"

log "watch-only escrow wallet"
# Birthday defaults to the current tip: the escrow cannot have older notes.
wallet escrow init-fvk --name escrow --fvk "$UFVK" -s "$LWD" >/dev/null
wallet escrow get-info -s "$LWD"
