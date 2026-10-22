#!/usr/bin/env bash
# Starts a fresh Zebra regtest + lightwalletd and a "funder" wallet that receives the
# block rewards. With NU6.3 active, Zebra pays the coinbase straight into the funder's
# Ironwood receiver, so no transparent address is ever involved.
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"

log "fresh run dir $RUN_DIR"
regtest_down
rm -rf "$RUN_DIR" "$ESCROW"
mkdir -p "$RUN_DIR"

# Wallets need a running chain to be created, and the chain needs a miner address
# to mine, so the funder's address is derived offline from a fresh mnemonic.
uv run -q --with mnemonic==0.21 python -I -c \
  'from mnemonic import Mnemonic; print(Mnemonic("english").generate(256))' >"$RUN_DIR/funder.mnemonic"
# The derived UA also has Sapling and transparent receivers; mine to its Orchard-only
# receiver, which NU6.3 pays into the Ironwood pool.
UA=$(devtool wallet derive-address -n regtest --mnemonic "$(cat "$RUN_DIR/funder.mnemonic")" |
  awk '/^Unified Address:/{print $3}')
MINER_ADDRESS=$(devtool inspect "$UA" 2>&1 | sed -n 's/.*- Orchard (\(uregtest1[a-z0-9]*\)).*/\1/p')
[ -n "$MINER_ADDRESS" ] || die "no Orchard receiver in $UA"
export MINER_ADDRESS

log "zebra 7.0.0 + lightwalletd v0.6.0"
"${COMPOSE[@]}" up -d --wait >/dev/null
for _ in $(seq 30); do rpc getblockcount '[]' >/dev/null 2>&1 && break; sleep 1; done

# Coinbase needs 100 confirmations before it can be spent.
log "mining 110 blocks to the funder"
mine 110

# Birthday 2: lightwalletd cannot serve the tree state at height 0.
wallet funder restore-mnemonic --name funder -i "$IDENTITY" -n regtest \
  --activation-heights "$HEIGHTS" --birthday 2 -s "$LWD" <"$RUN_DIR/funder.mnemonic" >/dev/null
sync_wallet funder
wallet funder balance | grep -E 'Balance|Ironwood'
