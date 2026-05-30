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

exec pencil "$@"
