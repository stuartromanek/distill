#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Proxy spawns `agent` CLI — it needs CURSOR_API_KEY in *its* process env.
export CURSOR_API_KEY="${CURSOR_API_KEY:-${NUXT_CURSOR_API_KEY:-}}"

# Chat-only temp HOME breaks Cursor agent security/auth (exit 154). Use real workspace.
export CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE=false

exec node ./node_modules/cursor-api-proxy/dist/cli.js "$@"
