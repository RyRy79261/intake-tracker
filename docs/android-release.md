# Android Release & Google Play Publishing

This document describes how Intake Tracker is built, signed, and shipped to the
Google Play Store.

The app is a Next.js PWA wrapped in [Capacitor](https://capacitorjs.com/). The
`android/` directory is the native Android project. CI builds a **signed Android
App Bundle (`.aab`)** and uploads it to Google Play on every published GitHub
release.

- **Application ID:** `dev.ryanjnoble.intaketracker`
- **Workflow:** [`.github/workflows/android-release.yml`](../.github/workflows/android-release.yml)
- **Signing config:** [`android/app/build.gradle`](../android/app/build.gradle)

---

## Overview of the pipeline

On every published GitHub release the `Android Release` workflow:

1. Builds the static web export (`scripts/cap-build.js`) and syncs it into the
   Android project (`npx cap sync android`).
2. Derives `versionCode`/`versionName` from `package.json`
   (`major*10000 + minor*100 + patch`).
3. Decodes the upload keystore from the `ANDROID_KEYSTORE_BASE64` secret.
4. Builds a **signed AAB** (`bundleRelease`) and a **signed APK**
   (`assembleRelease`).
5. Attaches both artifacts to the GitHub release.
6. Uploads the AAB to Google Play on the configured track (default `beta`).

You can also re-run it manually via **Actions → Android Release → Run workflow**
against an existing tag (useful for retrying a failed Play upload).

---

## One-time setup

### 1. Generate an upload keystore

With **Google Play App Signing** (recommended and the default for new apps),
the key you generate here is only an *upload key*. Google holds the real
app-signing key; if you ever lose the upload key you can reset it from the Play
Console.

Run the helper script from the repo root:

```bash
./scripts/generate-upload-keystore.sh
```

It will:

- Prompt for a keystore password and a key password (**use the same value for
  both** — CI assumes they match).
- Write `upload-keystore.jks` (git-ignored).
- Write `upload-keystore.jks.base64.txt` (the base64 blob for the GitHub
  secret).
- Print exactly which secrets to set.

Keep `upload-keystore.jks` somewhere safe (a password manager or encrypted
vault) and **never commit it**. The repo's `.gitignore` already blocks `*.jks`,
`*.keystore`, `keystore.properties`, and the base64 file.

### 2. Add the signing secrets to GitHub

**Settings → Secrets and variables → Actions → New repository secret:**

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Contents of `upload-keystore.jks.base64.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password you entered |
| `ANDROID_KEY_ALIAS` | `upload` (default alias from the script) |
| `ANDROID_KEY_PASSWORD` | The key password you entered |

Once the secrets are in GitHub, delete the local base64 file:

```bash
rm upload-keystore.jks.base64.txt
```

### 3. Create the app in the Play Console (manual, one time)

The Play Developer API **cannot create a new app listing** — the first bundle
must be uploaded by hand:

1. In the [Play Console](https://play.google.com/console), create a new app with
   package name `dev.ryanjnoble.intaketracker`.
2. Make sure **Play App Signing** is enabled (default for new apps).
3. Build a bundle locally (see [Local release builds](#local-release-builds)) or
   download the `.aab` from the GitHub release, then upload it once to your
   chosen track and complete the store listing / content rating / data-safety
   forms.

After this first manual upload, every subsequent GitHub release is uploaded
automatically by CI.

### 4. Create a Play service account for automated uploads

1. In the Play Console: **Setup → API access** → link or create a Google Cloud
   project.
2. Create a **service account** in Google Cloud, then grant it access in the
   Play Console (**Users and permissions → Invite new users**) with at least the
   *Release to testing tracks* / *Release apps to production* permissions for
   this app.
3. Create a JSON key for the service account and download it.
4. Add it to GitHub as the secret **`PLAY_SERVICE_ACCOUNT_JSON`** (paste the full
   JSON contents).

The Google Play Android Developer API must be enabled in the Cloud project.

If `PLAY_SERVICE_ACCOUNT_JSON` is absent, the workflow still builds and signs the
artifacts and attaches them to the release — it just skips the Play upload step.

### 5. (Optional) Choose the release track

The workflow defaults to the **`beta`** (open testing) track. To change it, set a
repository **variable** (not secret) named `PLAY_TRACK`:

**Settings → Secrets and variables → Actions → Variables → New repository variable**

| Variable | Allowed values |
| --- | --- |
| `PLAY_TRACK` | `internal`, `alpha` (closed testing), `beta` (open testing), `production` |

---

## Cutting a release

1. Bump the version and merge (release-please manages this — see
   `release-please-config.json`).
2. Publish the GitHub release for the new tag.
3. The `Android Release` workflow runs automatically:
   - Signed `intake-tracker-vX.Y.Z.aab` + `.apk` are attached to the release.
   - The AAB is uploaded to the `PLAY_TRACK` track and rolled out (`status:
     completed`).

`versionCode` is derived from the semver, so it always increases as long as the
version bumps — Play rejects re-uploads of an existing `versionCode`.

---

## Local release builds

To produce a signed bundle locally, create `android/keystore.properties`
(git-ignored):

```properties
storeFile=/absolute/path/to/upload-keystore.jks
storePassword=your-keystore-password
keyAlias=upload
keyPassword=your-key-password
```

Then:

```bash
node scripts/cap-build.js     # build + export web assets
npx cap sync android
cd android
./gradlew bundleRelease       # -> app/build/outputs/bundle/release/app-release.aab
./gradlew assembleRelease     # -> app/build/outputs/apk/release/app-release.apk
```

If no keystore is configured, `build.gradle` logs a warning and the release
artifacts are left unsigned (not uploadable to Play). Debug builds
(`./gradlew assembleDebug`) are unaffected.

---

## Troubleshooting

- **`ANDROID_KEYSTORE_BASE64 secret is not set`** — add the four signing secrets
  (step 2).
- **Play upload step skipped** — `PLAY_SERVICE_ACCOUNT_JSON` is missing (step 4).
- **`APK specifies a version code that has already been used`** — bump the app
  version; `versionCode` is computed from the semver.
- **`The caller does not have permission` on upload** — the service account
  hasn't been granted access to this app in the Play Console, or the API isn't
  enabled in the Cloud project (steps in §4).
- **First upload fails via API** — expected; the very first bundle for a new app
  must be uploaded manually (step 3).

## Security notes

- The upload keystore and all passwords live only in GitHub Actions secrets and
  your local machine — never in the repo.
- `.gitignore` blocks `*.jks`, `*.keystore`, `keystore.properties`,
  `upload-keystore.*`, and `play-service-account*.json`.
- Rotate the service-account key periodically; revoke it in Google Cloud if it
  is ever exposed.
