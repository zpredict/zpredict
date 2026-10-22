#!/usr/bin/env bash
# Queues a Coolify deploy for each uuid given. Used by .github/workflows/deploy.yml.
# Needs COOLIFY_URL and COOLIFY_TOKEN (a deploy-only token); skips with a warning if unset.
set -euo pipefail

if [ -z "${COOLIFY_URL:-}" ] || [ -z "${COOLIFY_TOKEN:-}" ] || [ "$#" = 0 ]; then
	echo "::warning::COOLIFY_URL, COOLIFY_TOKEN or the resource uuids are not set; skipping deploy."
	exit 0
fi
for uuid in "$@"; do
	code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
		-H "Authorization: Bearer $COOLIFY_TOKEN" \
		"$COOLIFY_URL/api/v1/deploy?uuid=$uuid")
	if [ "$code" != 200 ]; then
		echo "::error::deploy $uuid failed with HTTP $code"
		exit 1
	fi
	echo "queued $uuid"
done
