#!/usr/bin/env bash
# Build a debug-signed Android APK from the Next.js app via Capacitor.
#
# What it does:
#   1. Temporarily moves src/app/api aside (Next.js refuses output:'export'
#      when route handlers exist in the tree).
#   2. Runs `next build` with BUILD_TARGET=android, producing static HTML/JS
#      under ./out.
#   3. Restores src/app/api unconditionally (trap on EXIT).
#   4. Runs `npx cap sync android` to copy ./out into android/app/src/main/
#      assets/public and update plugin registrations.
#   5. Builds android/app/build/outputs/apk/debug/app-debug.apk via Gradle.
#
# Configuration (set via env or .env.android.local in repo root):
#   NEXT_PUBLIC_API_BASE_URL  Origin where /api/* is hosted (e.g. your
#                              Vercel deployment URL). Required for AI
#                              features to work when the device is online.
#                              Leave unset to ship a fully offline-only APK
#                              with AI/push features disabled.
#   NEXT_PUBLIC_PRIVY_APP_ID  Leave UNSET for the Android build. Privy's
#                              embedded auth iframe doesn't whitelist the
#                              capacitor:// origin; the app falls back to
#                              its no-auth path (providers.tsx).
#
# Requires: Java 17+, Android SDK with platform-tools (ANDROID_HOME set),
# pnpm, the @capacitor/* devDependencies installed, and `android/` initialised
# via `npx cap add android`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

API_DIR="src/app/api"
# Stash the API routes outside the repo so neither Next.js (src/app) nor
# tsc (tsconfig include is **/*.ts) sees them during the export build.
API_STASH="$(mktemp -d -t intake-tracker-api-stash.XXXXXX)/api"

if [ -f .env.android.local ]; then
  set -a
  # shellcheck disable=SC1091
  . .env.android.local
  set +a
fi

restore_api() {
  if [ -d "$API_STASH" ]; then
    rm -rf "$API_DIR"
    mv "$API_STASH" "$API_DIR"
    rmdir "$(dirname "$API_STASH")" 2>/dev/null || true
    echo "[android] restored $API_DIR"
  fi
}
trap restore_api EXIT

if [ -d "$API_DIR" ]; then
  echo "[android] stashing $API_DIR -> $API_STASH"
  mv "$API_DIR" "$API_STASH"
fi

rm -rf out
echo "[android] running next build (output: export)"
BUILD_TARGET=android pnpm exec next build

if [ ! -d out ]; then
  echo "[android] expected ./out after next build, not found" >&2
  exit 1
fi

echo "[android] syncing into Capacitor android project"
pnpm exec cap sync android

if [ "${SKIP_GRADLE:-0}" = "1" ]; then
  echo "[android] SKIP_GRADLE=1, stopping before gradle"
  exit 0
fi

echo "[android] running gradle assembleDebug"
( cd android && ./gradlew assembleDebug )

APK="android/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK" ]; then
  echo "[android] built $APK"
  echo "[android] install with: adb install -r $APK"
else
  echo "[android] gradle finished but $APK is missing" >&2
  exit 1
fi
