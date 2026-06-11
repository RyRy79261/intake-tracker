#!/usr/bin/env bash
#
# generate-upload-keystore.sh
#
# Creates an Android *upload* keystore for signing release builds of Intake
# Tracker, then prints the values you need to paste into GitHub repository
# secrets so CI can sign the AAB it ships to Google Play.
#
# With Google Play App Signing (recommended), THIS key is only your *upload*
# key. Google holds the real app-signing key. If you ever lose this upload key
# you can reset it from the Play Console — but keep it safe regardless.
#
# Usage:
#   ./scripts/generate-upload-keystore.sh [output-path]
#
# Default output: ./upload-keystore.jks (git-ignored). Move it somewhere safe
# (a password manager / encrypted vault) once you've captured the secrets.

set -euo pipefail

KEYSTORE_PATH="${1:-upload-keystore.jks}"
KEY_ALIAS="${KEY_ALIAS:-upload}"
VALIDITY_DAYS="${VALIDITY_DAYS:-10950}" # ~30 years; Play requires a long validity

if ! command -v keytool >/dev/null 2>&1; then
  echo "error: 'keytool' not found. Install a JDK (e.g. Temurin 21) and retry." >&2
  exit 1
fi

if [[ -e "$KEYSTORE_PATH" ]]; then
  echo "error: '$KEYSTORE_PATH' already exists. Refusing to overwrite." >&2
  echo "       Pass a different path or remove the existing file first." >&2
  exit 1
fi

echo "==> Generating upload keystore: $KEYSTORE_PATH"
echo "    alias=$KEY_ALIAS  validity=${VALIDITY_DAYS} days  algorithm=RSA 2048"
echo
echo "You'll be prompted for a keystore password and a key password."
echo "TIP: use the SAME value for both — the CI build assumes they match."
echo

# -dname can be customised; Play does not require accurate values for an upload key.
DNAME="${DNAME:-CN=Intake Tracker, OU=Mobile, O=ryanjnoble.dev, L=, ST=, C=}"

keytool -genkeypair \
  -v \
  -keystore "$KEYSTORE_PATH" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity "$VALIDITY_DAYS" \
  -dname "$DNAME"

echo
echo "==> Done. Keystore written to: $KEYSTORE_PATH"
echo

BASE64_FILE="${KEYSTORE_PATH}.base64.txt"
base64 < "$KEYSTORE_PATH" | tr -d '\n' > "$BASE64_FILE"

cat <<EOF
======================================================================
Add these as GitHub repository secrets
(Settings → Secrets and variables → Actions → New repository secret):
======================================================================

  ANDROID_KEYSTORE_BASE64    -> contents of: ${BASE64_FILE}
  ANDROID_KEYSTORE_PASSWORD  -> the keystore password you just entered
  ANDROID_KEY_ALIAS          -> ${KEY_ALIAS}
  ANDROID_KEY_PASSWORD       -> the key password you just entered

To copy the base64 to your clipboard:
  macOS:  pbcopy < ${BASE64_FILE}
  Linux:  xclip -selection clipboard < ${BASE64_FILE}

======================================================================
NEXT: also add the Play upload secret + variable (see docs):
  PLAY_SERVICE_ACCOUNT_JSON  -> Google Cloud service-account JSON
  PLAY_TRACK (variable)      -> internal | alpha | beta | production
See docs/android-release.md for the full walkthrough.
======================================================================

SECURITY: keep '${KEYSTORE_PATH}' safe and OUT of git. Once the secrets are
in GitHub, delete the local base64 file:  rm ${BASE64_FILE}
EOF
