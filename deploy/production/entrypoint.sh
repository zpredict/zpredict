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
exec zpredict-relayer /etc/zpredict/relayer.toml
