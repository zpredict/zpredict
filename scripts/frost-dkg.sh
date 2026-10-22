#!/usr/bin/env bash
# Runs the 2-of-3 FROST DKG (RedPallas, frost-core as a library) for relayers r0 r1 r2,
# derives the escrow viewing key and Ironwood address from the group key, makes one memo
# key per relayer, and creates the watch-only escrow wallet. Every secret is sealed under
# ZPREDICT_STORE_KEY as it is made: the shares, the UFVK and the memo keys never exist
# in clear on disk, and the escrow wallet is sealed again when this step ends.
# Writes $RUN_DIR/escrow.env (group key, address, memo public keys).
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"

F=$RUN_DIR/frost
PARTIES=(r0 r1 r2)
mkdir -p "$F"

log "DKG 2-of-3 (redpallas, in-process; same host for this demo)"
out=$("$BIN/settle-payout" dkg "$NETWORK" "$F")
GROUP=$(awk '/^group/{print $2}' <<<"$out")
ADDRESS=$(awk '/^address/{print $2}' <<<"$out")
[ -n "$GROUP" ] && [ -n "$ADDRESS" ] || die "DKG failed"

MEMO_PKS=()
for p in "${PARTIES[@]}"; do
  MEMO_PKS+=("$("$BIN/settle" memo-key "$F/$p-memo.sealed" | awk '{print $2}')")
done
printf 'GROUP=%s\nESCROW_ADDRESS=%s\nMEMO_PKS="%s"\n' "$GROUP" "$ADDRESS" "${MEMO_PKS[*]}" >"$RUN_DIR/escrow.env"
echo "group key (ak): $GROUP"
echo "escrow address: $ADDRESS"

log "watch-only escrow wallet (sealed when this step ends)"
escrow_open
trap escrow_close EXIT
# Birthday defaults to the current tip: the escrow cannot have older notes.
wallet escrow init-fvk --name escrow --fvk "$("$BIN/settle" open ufvk <"$F/escrow-ufvk.sealed")" \
  -s "$LWD" >/dev/null
wallet escrow get-info -s "$LWD"
