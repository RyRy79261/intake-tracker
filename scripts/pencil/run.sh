#!/usr/bin/env bash
#
# Thin wrapper around the global @pencil.dev/cli for this repo.
#
# The Pencil CLI is installed globally (pnpm) and authenticated via a stored
# session (`pencil login`). This wrapper only guarantees the pnpm global bin is
# on PATH, then passes every argument straight through to `pencil`.
#
# Usage:
#   scripts/pencil/run.sh status
#   scripts/pencil/run.sh --out design/screens/foo.pen --prompt "..." \
#       --export design/exports/foo.png --workspace design/reference
#
# See design/README.md for the full workflow.
set -euo pipefail

export PATH="$HOME/.local/share/pnpm:$PATH"

if ! command -v pencil >/dev/null 2>&1; then
  echo "error: 'pencil' CLI not found on PATH." >&2
  echo "Install it with: npm i -g @pencil.dev/cli   (then: pencil login)" >&2
  exit 127
fi

# Concurrency guard. Pencil's MCP server is a machine-wide singleton: two
# `pencil` processes running at once (ANY project) share one global canvas and
# corrupt each other's output. Refuse to start if another run is in flight.
# Override with ALLOW_CONCURRENT_PENCIL=1 only if you know the other run is idle.
if [ "${ALLOW_CONCURRENT_PENCIL:-0}" != "1" ] && \
   pgrep -f "@pencil.dev/cli/dist/index.cjs" >/dev/null 2>&1; then
  echo "error: another Pencil CLI process is already running." >&2
  echo "Pencil's MCP server is a machine-wide singleton — concurrent runs share one" >&2
  echo "canvas and corrupt each other. Wait for it to finish, then retry." >&2
  pgrep -af "@pencil.dev/cli/dist/index.cjs" | sed 's/--prompt.*/--prompt [snip]/' >&2
  exit 1
fi

exec pencil "$@"
