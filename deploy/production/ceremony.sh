#!/bin/bash
# Escrow key ceremony for the hosted relayers (#78). Runs once, inside a throwaway
# `ceremony` container on the VPS with /work on tmpfs and the three relayer data volumes
# mounted at /r0 /r1 /r2 (see deploy/README.md "Key ceremony").
#
# stdin: three lines, the store keys of r0, r1, r2 (64 hex each; also Coolify secrets
# R{i}_STORE_KEY). The DKG itself seals under a fourth key that exists only in this
# process. Every secret leaves here sealed under its relayer's own key:
#   /rN/escrow/share.sealed   FROST key share (2-of-3 escrow spends, outcome signatures)
#   /rN/escrow/ufvk.sealed    escrow viewing key
#   /rN/escrow/memo.sealed    deposit-memo key; memo.pub is its public half
#   /r0/escrow/escrow-wallet.sealed   relayer 0's watch-only zcash-devtool wallet
# Prints only public values: group key, escrow address, start height, memo public keys.
set -euo pipefail
umask 077
read -r K0
read -r K1
read -r K2
for i in 0 1 2; do
	[ ! -e "/r$i/escrow" ] || { echo "/r$i/escrow exists: refusing to overwrite a ceremony" >&2; exit 1; }
done

KM=$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')
W=/work
out=$(ZPREDICT_STORE_KEY=$KM settle-payout dkg test "$W")
group=$(echo "$out" | awk '/^group/{print $2}')
address=$(echo "$out" | awk '/^address/{print $2}')
[ -n "$group" ] && [ -n "$address" ] || { echo "DKG failed" >&2; exit 1; }

# reseal <label> <from> <to> <key>: plaintext only passes through the pipe.
reseal() { ZPREDICT_STORE_KEY=$KM settle open "$1" <"$2" | ZPREDICT_STORE_KEY=$4 settle seal "$1" >"$3"; }

pubs=""
for i in 0 1 2; do
	case $i in 0) K=$K0 ;; 1) K=$K1 ;; *) K=$K2 ;; esac
	d=/r$i/escrow
	mkdir "$d"
	reseal frost-key-share "$W/r$i-share.sealed" "$d/share.sealed" "$K"
	reseal ufvk "$W/escrow-ufvk.sealed" "$d/ufvk.sealed" "$K"
	pub=$(ZPREDICT_STORE_KEY=$K settle memo-key "$d/memo.sealed" | awk '{print $2}')
	printf %s "$pub" >"$d/memo.pub"
	pubs="$pubs $pub"
done

# Watch-only escrow wallet for relayer 0 (the prover), born at the current testnet tip.
mkdir "$W/wallet"
devtool() { RUST_LOG=warn zcash-devtool "$@"; }
devtool wallet -w "$W/wallet" init-fvk --name escrow \
	--fvk "$(ZPREDICT_STORE_KEY=$KM settle open ufvk <"$W/escrow-ufvk.sealed")" -s zecrocks >/dev/null
tip=$(devtool wallet -w "$W/wallet" get-info -s zecrocks | sed -n 's/.*"chain_tip_height": *\([0-9]*\).*/\1/p')
tar -C "$W/wallet" -cf - . | ZPREDICT_STORE_KEY=$K0 settle seal escrow-wallet >/r0/escrow/escrow-wallet.sealed
rm -rf "${W:?}"/*

echo "group $group"
echo "address $address"
echo "start_height $tip"
echo "memo_pubs$pubs"
