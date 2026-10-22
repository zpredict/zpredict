#!/bin/sh
# Writes the Noise keys from env (Coolify secrets) to a tmpfs, then drops the private
# key from the environment before starting the relayer. Keys never touch the image or git.
set -eu
umask 077
k=/run/zpredict
printf %s "${RELAYER_KEY:?}" >"$k/self.key"
printf %s "${RELAYER_PUB_0:?}" >"$k/r0.pub"
printf %s "${RELAYER_PUB_1:?}" >"$k/r1.pub"
printf %s "${RELAYER_PUB_2:?}" >"$k/r2.pub"
unset RELAYER_KEY
# Deposit-memo public key (`settle memo-key`), served at GET /memo-key once set.
if [ -n "${MEMO_PUB:-}" ]; then
	printf %s "$MEMO_PUB" >"$k/memo.pub"
	export ZPREDICT_MEMO_KEY_FILE="$k/memo.pub"
fi
exec zpredict-relayer /etc/zpredict/relayer.toml
