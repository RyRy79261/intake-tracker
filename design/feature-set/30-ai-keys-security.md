# 30 — AI Keys, Medical-AI Consent & Security

**Files covered:**
- `src/components/settings/ai-keys-section.tsx` — Settings → AI features panel (provider cards, key sharing, usage summary)
- `src/components/settings/medical-ai-section.tsx` — Settings → Privacy & Security medical-AI opt-in wrapper
- `src/components/profile/ai-insights-consent-toggle.tsx` — the consent toggle + disclaimer dialog (shared by Settings & Profile)
- `src/components/profile/medical-context-section.tsx` — Profile conditions chips + the same consent toggles
- `src/hooks/use-ai-keys.ts` — React Query hooks for key status/set/delete, shares, usage
- `src/hooks/use-ai-fetch.ts` — thin wrapper around `apiFetch` for AI requests
- `src/lib/security.ts` — PII redaction (`sanitizeForAI`), obfuscation, input sanitisation, secure-context warnings
- `src/lib/crypto.ts` — client-side AES-GCM encryption / PIN hashing (Web Crypto)
- `src/lib/key-vault.ts` — server-side AES-256-GCM key encryption (env-secret master key)
- `src/lib/ai-key-resolver.ts` — server-side key resolution priority (own → shared → env)
- `src/lib/auth-middleware.ts` — `withAuth()` wrapper, whitelist enforcement, bearer/cookie auth
- `src/lib/profile-service.ts` — profile CRUD, consent fields, condition limits
- `src/app/api/user/api-keys/route.ts` — GET/PUT/DELETE encrypted key store
- `src/app/api/user/api-keys/shares/route.ts` — GET/POST/DELETE key shares
- `src/app/api/user/ai-usage/route.ts` — GET usage aggregation
- `src/app/api/ai/_shared/usage-tracker.ts` — fire-and-forget usage logging
- `src/app/api/ai/status/route.ts` — public AI-config health check
- `src/db/schema.ts` — `userApiKeys`, `userKeyShares`, `aiUsage`, `userProfile` tables

**Purpose:** Lets a signed-in user supply, encrypt, share, revoke and monitor usage of their own Anthropic / Groq API keys, and separately opt in (with a medical disclaimer) to sharing their conditions and medications with AI insights. Backed by server-side authenticated-encryption, a key-resolution fallback chain, PII stripping before any external AI call, and a whitelist gate on every API route.

---

## Features

### AI keys panel (`AiKeysSection` — Settings → "AI features" accordion)
- **Gated by auth.** When auth is not ready → renders nothing. When unauthenticated → shows a muted "Sign in to manage AI keys" card. When authenticated → renders the full panel.
- **Intro copy:** "AI features run through your own provider keys, billed directly by Anthropic and Groq. … Keys are encrypted at rest on the server."
- **Per-provider cards** (one per entry in `PROVIDERS`): name, description, provider icon (colored), current status line, and add/replace/remove controls.
- **Status line** per provider, one of: loading ("Loading…"), configured ("Using your key ending in `<last4>`"), received-share ("Granted by `<grantorEmail>`"), or not-configured ("Not configured. Add a key, or ask someone to share theirs.").
- **Add / replace key** inline form: password input, prefix-validated, console help link, "Stored encrypted on the server" note.
- **Remove key** (only when configured) — red destructive button.
- **Share your key** sub-section (`ShareControls`): grant a stored key to another user by email; choose provider; list current grants with revoke buttons. A permanent helper line under the input reads "They must have signed in at least once before you can share."
- **Usage (last 30 days)** sub-section (`UsageSummary`): per-provider call counts for the user's own usage, plus consumption others incurred against the user's shared keys. The displayed token/audio breakdown is limited — only input/output tokens (Anthropic) and audio seconds (Groq) are rendered. `cacheReadTokens`, `cacheCreateTokens`, and the route-level `mine.byRoute` array are fetched/typed by the hook but **not displayed anywhere** in the UI.

### Medical-AI consent (`MedicalAiSection` — Settings → Privacy & Security; `MedicalContextSection` — Profile)
- Two independent opt-in toggles: **Share conditions with AI insights** and **Share medications with AI insights**.
- **First-enable consent gate**: the first time *any* sharing toggle is turned on, a consent dialog appears; confirming it is the consent act and records `aiInsightsConsentAt` once (covers all toggles thereafter).
- **Info dialog**: an info (ⓘ) button re-opens the same disclaimer text read-only ("About AI insights").
- **Disclaimer body** (shared between consent + info): explains sharing intent, that AI guesses can be wrong, that it is for understanding/consultation prep, not a diagnosis, and never replaces a medical professional.
- **Conditions management** (Profile `MedicalContextSection`): add/remove free-text condition chips (e.g. "HFrEF"), with a count + length limit; conditions stay on-device unless sharing is on.
- **Helper copy** clarifies medications come from the Medications page and conditions from the Profile page; explains exactly what "share medications" sends (name, dose, frequency, current titration/maintenance phase duration).

### Security primitives (libraries, not directly user-facing)
- **Server key vault** (`key-vault.ts`): AES-256-GCM, env-secret master key, AAD-bound to `userId:provider`, versioned blob format (`v1:` active, `v2:` reserved for KMS). Only the last 4 chars are ever stored in plaintext / exposed.
- **Key resolution** (`ai-key-resolver.ts`): priority own-stored → shared-from-grantor → env-var (whitelist-only).
- **PII redaction** (`security.ts` `sanitizeForAI`, backed by the private `redactPii` helper): strips email, phone (intl + US), SSN, credit-card, DOB/date, 13-digit SA ID before any text leaves for an AI provider; caps to 500 chars. Applied across the AI routes (parse, substance-enrich, titration-warnings, nutrient-analysis, voice-parse, substance-lookup, medicine-search, interaction-check, …).
- **Client crypto** (`crypto.ts`): AES-GCM encrypt/decrypt + PBKDF2 PIN hashing/verification + secure ID generation (used for local at-rest data encryption, separate from server key vault).
- **Whitelist gate** (`auth-middleware.ts`): every AI/user route runs through `withAuth()`; `ALLOWED_EMAILS` enforced; distinguishes 401 (re-auth) from 403 (unapproved account).
- **Usage audit**: `[AUDIT]` console logs on key set/clear and share grant/revoke; `ai_usage` row per call.

---

## User actions & interactions

### Provider card (`ProviderCard`)
- **Tap "Add key" / "Replace key"** → opens inline editor (password input + help link + Save/Cancel).
- **Type / paste key** into password field (`autoComplete="off"`).
- **Tap "Save"**:
  - Empty after trim → toast "Enter a key" (destructive); no request.
  - Wrong prefix → toast "Invalid `<name>` key" / "`<name>` keys start with `<prefix>`" (destructive); no request.
  - Valid → `PUT /api/user/api-keys`; on success clears input, closes editor, toast "`<name>` key saved" (success); on error toast "Failed to save `<name>` key" + message.
  - Save button disabled while pending or when input is empty; label flips to "Saving…".
- **Tap "Cancel"** → closes editor, clears input.
- **Tap "Remove"** (only when configured) → `DELETE /api/user/api-keys?provider=…`; toast "`<name>` key removed" (success) or "Failed to remove…" (destructive). Disabled while pending.
- **Tap console help link** → opens provider console (`target="_blank"`, `rel="noopener noreferrer"`).

### Share controls (`ShareControls`)
- **Type grantee email** into email input.
- **Select provider** from a `<select>` (only providers the user actually has a key for appear as options).
- **Tap "Share"**:
  - Empty email → no-op (button also disabled).
  - `POST /api/user/api-keys/shares`; success → clears email, toast "Shared with `<email>` / They can now use your `<provider>` key." (success); failure → toast "Share failed" + message.
- **Tap "Revoke"** on a listed grant → `DELETE /api/user/api-keys/shares?granteeId=…&provider=…`; toast "Share revoked" (success) or "Revoke failed" (destructive). Disabled while pending.
- **Provider selector auto-corrects** (effect): if the selected provider has no key but the other does, it switches to the other.

### Consent toggle (`AiInsightsConsentToggle`)
- **Toggle ON, never consented** → opens consent dialog (does NOT save yet).
- **Consent dialog → "Enable insights"** → saves the field `true` AND `aiInsightsConsentAt = Date.now()`; closes dialog.
- **Consent dialog → "Cancel"** (or backdrop/Esc) → closes, toggle stays off, nothing saved.
- **Toggle ON, already consented** → saves field `true` immediately (no dialog).
- **Toggle OFF** → saves field `false` immediately.
- **Tap ⓘ info button** → opens read-only info dialog ("About AI insights" + same disclaimer); **"Got it"** closes it.

### Conditions (`MedicalContextSection`)
- **Type condition + Enter / tap "+"** → adds condition (trimmed; max-length enforced by input + service).
  - Duplicate (case-insensitive) → silently clears the draft, no add.
  - At `MAX_CONDITIONS` → toast "Limit reached / You can add up to 20 conditions." (destructive).
- **Tap "X" on a chip** → removes that condition.
- Add button disabled while draft is empty.

### Account (`AccountSection`, contextual)
- **Tap "Sign In"** → navigates to `/auth` (unauthenticated state lists AI parsing, dose reminders, cloud sync as unlocked features).
- **Sign out** (authenticated) via `handleSignOut`.

---

## States & presentations

### `AiKeysSection`
- **Auth not ready** → renders `null` (no flash).
- **Unauthenticated** → amber "AI features" header + muted bordered card prompting sign-in.
- **Authenticated** → full panel: header, intro, provider cards, share section (Share2 icon), usage section (Activity icon), each separated by `border-t`.

### `ProviderCard` status block
- **Loading** → "Loading…" muted text.
- **Configured** → "Using your key ending in `<last4>`" (last4 in mono; falls back to "????").
- **Received share** → "Granted by `<grantorEmail>`" (mono email).
- **Not configured** → prompt to add or request a shared key.
- **Editing** → inline form replaces the action row.
- **Not editing** → "Add key"/"Replace key" outline button (+ "Remove" red button when configured).
- **Saving** → Save button shows "Saving…", disabled.
- **Save disabled** when pending or input empty.

### `ShareControls`
- **No shareable key** (`!canShareAny`) → muted "Add a key above to share it with another user." (entire control hidden).
- **Has key(s)** → email input + provider select + Share button, with a permanent helper line below: "They must have signed in at least once before you can share."
- **Has grants** → "Currently shared:" list with `granteeEmail · provider` and revoke button per row.
- **No grants** → list section omitted.
- **Share/Revoke pending** → respective buttons disabled.
- **Share success toast** → "Shared with `<email>`" with description "They can now use your `<provider>` key."

### `UsageSummary`
- **Loading** → "Loading usage…".
- **Empty** → "No AI usage in the last `<windowDays>` days." (default 30).
- **Populated** → per-provider blocks: capitalized provider name + "N call(s)"; Anthropic adds "· `in` in / `out` out tokens"; Groq adds "· `N` s of audio" (only if audioSeconds > 0). Only these fields render — `cacheReadTokens`, `cacheCreateTokens`, and the route-level `mine.byRoute` breakdown are fetched by the hook but never shown.
- **As-grantor block** (only if others consumed your key) → "Consumption against your shared keys:" list, `granteeEmail · provider: N call(s)` (+ tokens for Anthropic).

### `AiInsightsConsentToggle`
- **Enabled** → sub-label "Your `<noun>` are included when generating AI insights."; switch on.
- **Disabled** → sub-label "Your `<noun>` stay on this device and are not sent to the AI."; switch off.
- **Dialog states:** `null` (closed), `"consent"` (Cancel + "Enable insights"), `"info"` ("Got it").
- Dialog title differs: "Share `<noun>` with AI?" (consent) vs "About AI insights" (info).

### `MedicalContextSection`
- **No conditions** → italic muted "No conditions added yet."
- **Has conditions** → wrap of pill chips, each with remove "X".
- **Add disabled** when draft empty.

### `AccountSection`
- **Not ready** → centered spinner card.
- **Unauthenticated** → "Not signed in" + unlock list + "Sign In" button.
- **Authenticated** → email + further account controls.

### Server / API error states surfaced as toasts
- **Invalid key format (server 400)** — also re-validated client-side before sending.
- **Server encryption not configured (503)** — "Server encryption is not configured" (master secret missing).
- **Grantee not found (404, `GRANTEE_NOT_FOUND`)** — "No account exists for that email. The grantee must sign in once first."
- **No own key to share (400, `NO_OWN_KEY`)** — "You don't have a stored `<provider>` key to share. Add one first."
- **Share with self (400)** — "You can't share a key with yourself".
- **Unauthenticated (401, `requiresAuth: true`)** — client should reopen sign-in.
- **Unapproved account (403, `accountUnapproved: true`)** — re-auth won't help; contact admin.

---

## Enums, options & configurable values

### Providers (`PROVIDERS` in `ai-keys-section.tsx`)
| id | name | description | icon | iconColor | prefix | placeholder | consoleUrl | consoleLabel |
|----|------|-------------|------|-----------|--------|-------------|------------|--------------|
| `anthropic` | Anthropic | "Powers food & drink parsing, substance lookup, medicine search." | `Sparkles` | `text-amber-500` | `sk-ant-` | `sk-ant-…` | console.anthropic.com/settings/keys | console.anthropic.com |
| `groq` | Groq | "Powers voice transcription (Whisper)." | `Mic` | `text-purple-500` | `gsk_` | `gsk_…` | console.groq.com/keys | console.groq.com |

- **`AiProvider` enum:** `"anthropic" | "groq"`.
- **`KeySource` enum:** `"own_stored" | "shared_from" | "env_var"`.
- **Usage record status:** `"success" | "error"`.
- **Insight report mode (`mode`):** `"fast" | "deep"` (nullable → treated as fast).

### Consent toggle fields (`ToggleField`)
- `shareConditionsWithAI` — label "Share conditions with AI insights", noun "conditions".
- `shareMedicationsWithAI` — label "Share medications with AI insights", noun "medications".
- `aiInsightsConsentAt` — number | null (epoch ms of first consent; null = never).

### Limits & defaults
- **`MAX_CONDITIONS` = 20** (`profile-service.ts`).
- **`MAX_CONDITION_LENGTH` = 120** chars per condition.
- **Key length validation:** `z.string().min(8).max(500)` (PUT schema).
- **Email validation:** `z.string().email().max(320)` (share POST).
- **Usage window:** `days` query, default **30**, clamped **1–365**.
- **`sanitizeForAI` length cap:** **500** chars; **`sanitizeReportText`** default **8000** chars.
- **`sanitizeNumericInput`** defaults: min **0**, max **100000**, optional precision.
- **`sanitizeTextInput`** default maxLength **500**.

### Crypto constants (`crypto.ts`, client at-rest)
- Algorithm **AES-GCM**, key length **256** bits, IV **12** bytes (96-bit), salt **16** bytes (128-bit), PBKDF2 iterations **100000** (SHA-256), blob `version: 1`.

### Key-vault constants (`key-vault.ts`, server)
- Algorithm **aes-256-gcm**, IV **12** bytes, key **32** bytes; master key from `API_KEY_ENCRYPTION_SECRET` (base64 or 64-char hex → 32 bytes); blob prefix `v1:` (active), `v2:` (reserved KMS).
- `lastFourOf` exposes only the trailing 4 chars.

### Security / obfuscation constants (`security.ts`)
- `OBFUSCATION_KEY = "intake-tracker-v1"` (XOR obfuscation, NOT encryption); obfuscated values prefixed `obf:`.

### Environment variables referenced
- `ALLOWED_EMAILS` (comma list, lowercased), `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `API_KEY_ENCRYPTION_SECRET`, `DATABASE_URL`, `NEON_AUTH_URL`, `NEXT_PUBLIC_API_BASE_URL`.

### AI status endpoint config flags (`/api/ai/status`)
- `authConfigured` (DATABASE_URL set), `serverAnthropicKeyConfigured`, `serverGroqKeyConfigured`, plus `timestamp` and `environment` (NODE_ENV). Reports server fallback config only — never any user's stored keys.

---

## Data model touched

### `userApiKeys` (schema.ts; one row per user)
- `userId` (PK, FK users_sync, cascade), `anthropicKeyEncrypted` (nullable text blob), `anthropicLast4`, `groqKeyEncrypted`, `groqLast4`, `createdAt`, `updatedAt` (timestamptz). Server-only; not in Dexie.

### `userKeyShares` (schema.ts)
- Composite PK `(grantorId, granteeId, provider)`; columns `grantorId`, `granteeId` (both FK users_sync cascade), `provider` (check `IN ('anthropic','groq')`), `granteeEmail`, `createdAt`. Index on `(granteeId, provider)`. Server-only.

### `aiUsage` (schema.ts)
- `id` serial PK, `timestamp`, `userId` (FK cascade), `keyOwnerId` (FK set-null), `keySource` (check `own_stored|shared_from|env_var`), `provider` (check `anthropic|groq`), `model`, `route`, `inputTokens`/`outputTokens`/`cacheReadTokens`/`cacheCreateTokens` (int, default 0), `audioSeconds` (nullable), `status` (check `success|error`), `durationMs`. Indexes on `(userId,timestamp)` and `(keyOwnerId,timestamp)`. Server-only.

### `userProfile` (schema.ts + `db.ts` `UserProfile`, Dexie-synced)
- `conditions` (string[]), `shareConditionsWithAI` (bool), `shareMedicationsWithAI` (bool, default false), `aiInsightsConsentAt` (bigint number | null), plus sync metadata (`id`, `createdAt`, `updatedAt`, `deletedAt`, `deviceId`). The Dexie `UserProfile` interface has **no `userId`** — that column exists only on the server Postgres table (`schema.ts`), injected by the sync engine. Consent fields read by `analytics/ai-insights-card.tsx` / `analytics/nutrient-analysis-card.tsx` to decide whether to attach `conditions` / medications to insight requests.

### `neon_auth.users_sync`
- Looked up by email (grant target) and by id (resolve grantor/grantee email). `ensureUserSynced` upserts the authenticated user so FKs resolve. Its upsert failure is **swallowed (logged, non-fatal)** — read routes don't need the row, so only a downstream write route surfaces the FK error on its own insert.

### Hook query keys (`use-ai-keys.ts`)
- `["user","api-keys"]`, `["user","api-keys","shares"]`, `["user","ai-usage", days]`. Set/delete invalidate keys (delete also invalidates shares); grant/revoke invalidate shares.

---

## Validation, edge cases & business rules

- **Two-layer key validation:** client checks non-empty + correct prefix before sending; server re-validates with `validateKeyFormat` (anthropic `sk-ant-`, groq `gsk_`) plus zod min/max.
- **Plaintext never round-trips:** the raw key is never returned by any GET; only `last4` and a `configured` boolean. `last4` is the *only* plaintext fragment persisted.
- **AAD binding:** ciphertext is bound to `userId:provider`; moving a row between users/providers fails to decrypt rather than silently succeeding.
- **Encryption-secret rotation invalidates all stored keys** (no auto re-encryption) — users must re-enter. Missing secret → PUT returns 503 "Server encryption is not configured".
- **Upsert semantics:** PUT inserts or `onConflictDoUpdate` on `userId`. DELETE nulls the provider's encrypted+last4 columns (keeps the row).
- **Key resolution priority:** own-stored → shared-from-grantor (ordered by `createdAt asc, grantorId asc`, iterates all shares; skips grantors whose key is gone — no LIMIT to avoid a stale grantor truncating a valid grant) → env-var (only if caller email is on `ALLOWED_EMAILS`). Otherwise throws `NoAiKeyError`.
- **Sharing prerequisites:** grantor must have the provider key stored (`NO_OWN_KEY` 400); grantee must already exist in users_sync (`GRANTEE_NOT_FOUND` 404, "sign in once first"); cannot share with self (400).
- **Revoke is bidirectional:** a user may delete a share as grantor (revoke access) OR as grantee (decline a received share) — the DELETE matches either direction for the given provider.
- **Unresolvable email fallback:** when a grantor's email can't be resolved for a `received` share, the API substitutes the literal string `"(unknown)"`; the `asGrantor` grantee email likewise falls back to `"(unknown)"`.
- **Duplicate share is a no-op** (`onConflictDoNothing` on composite PK).
- **Share-list sort order differs per list:** `granted` shares are returned **ascending** by `createdAt`; `received` shares **descending** by `createdAt`.
- **Consent is recorded once:** the first toggle-on with no prior consent records `aiInsightsConsentAt`; subsequent toggles save immediately. Nullish check (`!= null`) ensures both `null` and missing/undefined count as not-yet-consented.
- **Toggling off doesn't clear consent timestamp** — re-enabling later won't re-prompt.
- **Conditions normalisation:** in `normalizeConditions`, each item is trimmed and **truncated to 120 chars first**, blanks dropped, then case-insensitive dedupe, then the loop `break`s once 20 items are collected — silently dropping any overflow rather than erroring. (Input `maxLength` also enforces 120 chars at the UI.)
- **Singleton profile:** multiple active rows can briefly exist after a concurrent multi-device first-write; the newest-updated active (non-deleted) row wins via a `b.updatedAt - a.updatedAt` sort. Values spread over `emptyProfile()` so rows written before a field existed still have defaults.
- **Usage logging is fire-and-forget:** route handlers do not await `recordUsage`; failures are caught and logged with a sanitised message (DB errors can echo SQL/params, so only the message is logged). Lost rows on crash are acceptable.
- **Usage aggregation only counts `status='success'`** rows within the window; "mine" = calls the user incurred (any key); "asGrantor" = others' calls against the user's key (`keyOwnerId = me AND userId <> me`).
- **PII stripping is mandatory** before external AI text: `sanitizeForAI` redacts email/phone/SSN/card/date/SA-ID and caps to 500 chars; applied across at least 8 AI routes — parse, substance-enrich, titration-warnings, nutrient-analysis, voice-parse, substance-lookup, medicine-search, interaction-check (non-exhaustive).
- **Whitelist gate** (`withAuth`): empty `ALLOWED_EMAILS` allows all; otherwise 403 for non-listed emails; emails lowercased for comparison. Supports both bearer-token (Capacitor) and cookie (web) sessions; bearer validation has a 5s `AbortController` timeout. Bearer validation also **returns null (→401) when `NEON_AUTH_URL` is unset**, and validates the token upstream by sending it as the cookie header `__Secure-neon-auth.session_token=<token>` to the Neon Auth `get-session` endpoint.
- **Browser storage is NOT encrypted at rest** (documented limitation in `security.ts`); `obfuscateApiKey` is XOR/base64 obfuscation only, explicitly "NOT encryption".
- **Secure-context warnings** (`getSecurityWarnings`): warns if not HTTPS/localhost and if localStorage is unavailable (private browsing).

---

## Sub-components / variants

- **`AiKeysSection`** — top-level Settings AI panel; auth-gated container.
- **`ProviderCard`** — one card per provider (status + add/replace/remove + inline editor).
- **`ShareControls`** — grant-by-email + provider select + current-shares list with revoke.
- **`UsageSummary`** — own usage (per provider/route) + as-grantor consumption.
- **`MedicalAiSection`** — Settings → Privacy & Security wrapper mounting two consent toggles.
- **`MedicalContextSection`** — Profile conditions chips + the same two consent toggles + helper copy.
- **`AiInsightsConsentToggle`** — reusable opt-in switch with consent/info dialog and `DisclaimerBody`.
- **`DisclaimerBody`** — shared medical disclaimer text (consent + info dialogs).
- **`AccountSection`** — sign-in/out + feature-unlock list (contextually drives AI availability).
- **`useApiKeyStatus` / `useSetApiKey` / `useDeleteApiKey`** — key status + mutate hooks.
- **`useKeyShares` / `useGrantShare` / `useRevokeShare`** — share read + mutate hooks.
- **`useAiUsage`** — usage query hook (windowed by days).
- **`useAiFetch`** — `apiFetch` wrapper for AI requests.
- **`key-vault` (`encryptKey` / `decryptKey` / `lastFourOf`)** — server-side AES-256-GCM vault.
- **`crypto` (`encrypt` / `decrypt` / `hashPin` / `verifyPin` / `generateSecureId`)** — client Web-Crypto utilities.
- **`security` (`sanitizeForAI` / `sanitizeReportText` / `sanitizeTextInput` / `sanitizeNumericInput` / `obfuscateApiKey` / `getSecurityWarnings`)** — PII + input + context utilities. (`redactPii` is a private, non-exported internal helper used by `sanitizeForAI` / `sanitizeReportText`, not part of the public API.)
- **`ai-key-resolver` (`resolveAiKey` / `NoAiKeyError`)** — server key-selection chain.
- **`auth-middleware` (`withAuth`)** — per-route auth + whitelist gate.
- **`usage-tracker` (`recordUsage` / `tokensFromAnthropic`)** — usage logging helpers.
- **`/api/ai/status`** — public AI-config health check (server fallback config only).
