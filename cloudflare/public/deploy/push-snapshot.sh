#!/bin/sh
set -eu

: "${CLOUDFLARE_INGEST_URL:?请配置 CLOUDFLARE_INGEST_URL}"
: "${CLOUDFLARE_INGEST_TOKEN:?请配置 CLOUDFLARE_INGEST_TOKEN}"

snapshot="$(mktemp)"
trap 'rm -f "$snapshot"' EXIT

/usr/bin/curl -fsS --max-time 12 \
  http://127.0.0.1:9999/v1/dashboard \
  -o "$snapshot"

/usr/bin/curl -fsS --max-time 15 \
  -X POST "${CLOUDFLARE_INGEST_URL%/}/v1/ingest" \
  -H "Authorization: Bearer ${CLOUDFLARE_INGEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary "@$snapshot"
