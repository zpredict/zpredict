#!/bin/bash
# Sidecar for relayer 0: opens the sealed escrow wallet into the shared tmpfs volume at
# /wallet (never on disk in clear), then stays up so the tmpfs survives relayer restarts.
# Needs ZPREDICT_STORE_KEY (relayer 0's) and /data/escrow/escrow-wallet.sealed.
set -euo pipefail
umask 077
if [ -z "$(ls -A /wallet)" ]; then
	settle open escrow-wallet </data/escrow/escrow-wallet.sealed | tar -C /wallet -xf -
fi
touch /tmp/ready
exec sleep infinity
