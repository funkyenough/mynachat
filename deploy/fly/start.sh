#!/usr/bin/env bash
# Runs the three processes; if any exits, stop the machine so Fly restarts it cleanly.
set -euo pipefail

: "${FLY_APP_NAME:?}"
host="${PUBLIC_HOST:-$FLY_APP_NAME.fly.dev}"
export VERIFIER_URL="wss://$host/verifier"
export WEBAUTHN_RP_ID="$host"
export WEBAUTHN_ORIGIN="https://$host"

mkdir -p /data/audit
myna-verifier &
node_modules/.bin/next start -p 3000 -H 127.0.0.1 &
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &

wait -n
echo "a process exited; stopping" >&2
exit 1
