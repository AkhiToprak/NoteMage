#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Bulletproof entrypoint for the standalone Socket.IO presence + cowork
# server (ws-server.ts).
#
# Why this exists: DigitalOcean App Platform's "run command" field
# auto-wraps Node service commands in `npm`, which turns `tsx ws-server.ts`
# into `npm tsx ws-server.ts` and fails with "Unknown command: tsx".
# Wrapping the invocation in a bash script bypasses that auto-wrap
# entirely — App Platform just runs `bash bin/start-ws.sh` literally.
#
# The script works in any environment that has Node + the npm install
# already done. It calls tsx via its node_modules/.bin path so we don't
# depend on PATH ordering or `npx`.
#
# AP run command: bash bin/start-ws.sh
# Local equivalent: cd apps/web && bash bin/start-ws.sh
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

# Resolve to the project root regardless of where the script is invoked from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

# Prefer the pre-compiled JS bundle (produced by `pnpm --filter web build:ws`
# during the build pipeline) — running plain `node` on a .cjs file is
# the most portable option and never relies on tsx, npx, or PATH.
if [ -f "ws-dist/ws-server.cjs" ]; then
  echo "[start-ws] booting ws-dist/ws-server.cjs via $(which node)"
  exec node ws-dist/ws-server.cjs
fi

# Fallback: try tsx for local dev where the build step hasn't run.
if [ ! -f "ws-server.ts" ]; then
  echo "[start-ws] ERROR: neither ws-dist/ws-server.cjs nor ws-server.ts found in ${PROJECT_ROOT}" >&2
  exit 1
fi

if [ ! -x "node_modules/.bin/tsx" ]; then
  echo "[start-ws] ERROR: tsx is not installed and the compiled bundle is missing." >&2
  echo "[start-ws] Run 'pnpm --filter web build:ws' first, or install tsx as a dependency." >&2
  exit 1
fi

echo "[start-ws] booting ws-server.ts via $(pwd)/node_modules/.bin/tsx (uncompiled fallback)"
exec node_modules/.bin/tsx ws-server.ts
