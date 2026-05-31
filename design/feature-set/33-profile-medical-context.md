# 33 — Profile & Medical Context

**Files covered:**
- `/home/ryan/repos/Personal/intake-tracker/src/app/profile/page.tsx`
- `/home/ryan/repos/Personal/intake-tracker/src/components/profile/medical-context-section.tsx`
- `/home/ryan/repos/Personal/intake-tracker/src/components/profile/ai-insights-consent-toggle.tsx`
- `/home/ryan/repos/Personal/intake-tracker/src/hooks/use-profile-queries.ts`
- `/home/ryan/repos/Personal/intake-tracker/src/lib/profile-service.ts`
- `/home/ryan/repos/Personal/intake-tracker/src/components/settings/account-section.tsx` (account state, reused on this page)
- `/home/ryan/repos/Personal/intake-tracker/src/components/settings/medical-ai-section.tsx` (mirror of consent toggles in Settings → Privacy & Security)
- `/home/ryan/repos/Personal/intake-tracker/src/lib/db.ts` (`UserProfile` interface, L383–393)
- `/home/ryan/repos/Personal/intake-tracker/src/db/schema.ts` (`userProfile` pgTable, L646–671)
- `/home/ryan/repos/Personal/intake-tracker/src/lib/analytics-insights.ts` (consumer: `MedicationSchema`/`ProfileSchema`, prompt builder)
- `/home/ryan/repos/Personal/intake-tracker/src/lib/analytics-snapshot.ts` (`buildMedicationSummary`, consumer)
- `/home/ryan/repos/Personal/intake-tracker/src/components/analytics/ai-insights-card.tsx` (consumer of the consent flags)
- `/home/ryan/repos/Personal/intake-tracker/src/lib/nav-routes.ts` (route registration)

**Purpose:** The Profile page is a top-level swipeable route that shows the user's account/auth state and lets them capture self-reported medical conditions and grant per-category AI-sharing consent. Conditions stay device-local (synced/backed up like any record) and only reach the AI when the user explicitly opts in; the consent flow records a one-time consent timestamp and frames the data as clinical context for AI insights, never a diagnosis.

---

## Features

### Page composition (`/profile`)
- Two stacked sections inside a `max-w-lg`, mobile container with bottom padding (`pb-10`, `space-y-6`):
  1. **Account** section — heading "Account" (muted, small, semibold). Renders either a signed-out blurb or the full `AccountSection`.
  2. **Medical context** section (`MedicalContextSection`).
- Registered in nav as: path `/profile`, icon `CircleUser`, label "Profile", title "Profile", subtitle "Account & medical context". It is one of the five swipeable top-level tabs, registered in this `NAV_ROUTES` order: Profile / Intake / Meds / Analytics / Settings (the medications tab's registered label is `"Meds"`).

### Account state
- **Signed out** (page-level `SignedOutBlurb`): a slate card titled "You're not signed in", subtext "Your profile works on this device offline. Signing in also unlocks:", followed by a 3-item benefits list and a full-width "Sign In" button that routes to `/auth`.
  - Benefit list items (icon + text):
    - `CloudUpload` (emerald) — "Cloud sync — your conditions and medications on every device"
    - `Sparkles` (amber) — "AI insights & food parsing (once AI is enabled in Settings)"
    - `Bell` (blue) — "Dose reminder notifications"
- **`AccountSection`** (reused from Settings) renders in three states:
  - **Not ready** — centered spinner card (`Loader2` animate-spin).
  - **Not authenticated** — its own "Not signed in" card with a slightly different benefit list (`Sparkles` "AI food & drink parsing", `Bell` "Dose reminder notifications", `CloudUpload` "Cloud sync across devices") + "Sign In" button → `/auth`. (Note: page uses `SignedOutBlurb` for the unauthenticated case; `AccountSection`'s own not-auth branch is the fallback when `ready && !authenticated` is false.)
  - **Authenticated** — card showing the user's email (or "Signed in" fallback), subtext "Signed in via Neon Auth", and a destructive-styled "Sign Out" button (`LogOut` icon) calling `handleSignOut`.

### Medical conditions capture (`MedicalContextSection`)
- Card titled "Conditions" with a `HeartPulse` (rose) icon; section heading "Medical context".
- Explanatory copy: "Conditions you add stay on this device unless you turn on sharing below. They give AI insights clinical context — for example, why your sodium and fluid limits matter, and which trends are worth watching."
- **Condition chips**: each saved condition renders as a rounded pill (slate background) with the text and an `X` remove button (`aria-label="Remove {condition}"`).
- **Add input**: a text `Input` (placeholder "e.g. HFrEF, idiopathic dilated cardiomyopathy", `maxLength=120`) plus an outline icon `Button` with a `Plus` icon (`aria-label="Add condition"`).
- Live profile data via `useUserProfile()` (Dexie `useLiveQuery`, blank profile until resolved).

### Per-field AI-sharing consent (`AiInsightsConsentToggle`)
- Two toggles inside the conditions card (and mirrored in Settings → Privacy & Security via `MedicalAiSection`). Because the same `AiInsightsConsentToggle` instances in both places read one Dexie singleton through the live query, toggling on the Profile page and in Settings stays in lockstep:
  - **Share conditions with AI insights** (`field="shareConditionsWithAI"`, `noun="conditions"`)
  - **Share medications with AI insights** (`field="shareMedicationsWithAI"`, `noun="medications"`)
- Each toggle row: a `Label`, an `Info` (i) button opening an informational dialog, dynamic helper subtext, and a shadcn `Switch`. The `Label` and `Switch` are accessibly paired via `htmlFor`/`id` (`id={`toggle-${field}`}`).
- Helper subtext is state-dependent:
  - enabled → "Your {noun} are included when generating AI insights."
  - disabled → "Your {noun} stay on this device and are not sent to the AI."
- Below the toggles, a static note about medications: "Sharing medications sends your active prescriptions — name, dose, frequency, and how long the current titration or maintenance phase has run. Manage medications on the Medications page."
- **One-time consent dialog**: the first time *any* sharing toggle is enabled, a consent dialog appears (it *is* the opt-in — nothing saves until "Enable insights" is pressed). Confirming writes `field=true` **and** `aiInsightsConsentAt` together in a single atomic `save(...)` (one upsert). The single `aiInsightsConsentAt` timestamp covers *all* sharing toggles thereafter.
- **Informational re-open**: the `Info` button reopens the same disclaimer body in read-only "About AI insights" mode (single "Got it" button), regardless of consent state.

### Disclaimer body (shared between consent + info dialogs)
Three paragraphs (rendered as the dialog's accessible description):
1. "Turning this on shares your {noun} with the AI when it generates insights. Enabling it is your consent to include that data."
2. "AI insights are only an attempt to guess what your data might mean — they can, and sometimes will, be wrong. They are meant to help you understand your tracking and prepare for a consultation with your doctor."
3. "They are not a diagnosis and never replace a qualified medical professional. Always discuss any concerns, and any action you might take, with your healthcare provider."

### Downstream effect (consumers — context, not on this page)
- `ai-insights-card.tsx`: `shareConditions = shareConditionsWithAI && conditions.length > 0`; `shareMedications = shareMedicationsWithAI`; `personalised = shareConditions || shareMedications`. When generating, the payload includes `conditions: profile.conditions` (if shared) and `includeMedications: true` (if shared). The card surfaces a "Your medical profile" summary with check/X rows showing whether conditions/medications are included.
- `nutrient-analysis-card.tsx`: a second downstream consumer that mirrors the same `shareConditions` / `shareMedications` / `personalised` logic and renders its own "Your medical profile" check/X rows — both cards surface the sharing state, not just `ai-insights-card.tsx`.
- Conditions appear in the AI prompt as: "User-reported medical conditions: {joined with '; '}." plus a do-not-diagnose instruction.
- Medications, when shared, are summarised via `buildMedicationSummary()` into per-prescription lines (name, phase type, dose, frequency, days-on-phase).

---

## User actions & interactions

| Action | Where | Result |
|---|---|---|
| Tap "Sign In" | Signed-out blurb / not-auth account card | Router push to `/auth` |
| Tap "Sign Out" | Authenticated account card | `handleSignOut()` |
| Type a condition + press **Enter** | Add input | Calls `addCondition()` (prevents default newline) |
| Type a condition + tap **Plus** | Add button | Calls `addCondition()` (button disabled while input is empty/whitespace) |
| Add condition (valid, under limit, not duplicate) | — | Saves `conditions: [...conditions, value]`, clears draft |
| Add condition that duplicates an existing one (case-insensitive) | — | Silently clears the draft without saving |
| Add condition when already at `MAX_CONDITIONS` (20) | — | Destructive toast "Limit reached — You can add up to 20 conditions."; not saved |
| Tap the chip **X** | Condition chip | `removeCondition(target)` → saves filtered list |
| Toggle a share switch ON (first time, no prior consent) | Consent toggle | Opens consent dialog; nothing saved yet |
| Toggle a share switch ON (consent already given) | Consent toggle | Saves field=true immediately |
| Toggle a share switch OFF | Consent toggle | Saves field=false immediately |
| Tap **Info (i)** button | Toggle row | Opens "About AI insights" informational dialog |
| Tap "Enable insights" (consent dialog) | Consent dialog footer | Saves `{field: true, aiInsightsConsentAt: Date.now()}`, closes dialog |
| Tap "Cancel" (consent dialog) | Consent dialog footer | Closes dialog, nothing saved (switch remains off) |
| Tap "Got it" (info dialog) | Info dialog footer | Closes dialog |
| Tap outside / dismiss dialog (`onOpenChange(false)`) | Either dialog | Closes dialog (consent: nothing saved) |

---

## States & presentations

### Account section
- **Loading / not ready** — spinner card.
- **Signed out** — benefits card + Sign In button (page uses `SignedOutBlurb`; `AccountSection` has its own variant).
- **Authenticated** — email card + Sign Out button.

### Conditions list
- **Default (has conditions)** — wrapped pills with remove buttons.
- **Empty** — italic muted line "No conditions added yet."
- **Loading** — `useUserProfile` returns a blank profile (`emptyProfile()`, empty conditions) until the live query resolves, so the empty state shows first; there is no dedicated skeleton.
- **Add button disabled** — when the input is empty/whitespace (`disabled={!draft.trim()}`).
- **Over-limit** — at 20 conditions, a further add triggers a destructive toast (no inline error).

### Consent toggles
- **Off (default)** — switch unchecked, subtext "…stay on this device and are not sent to the AI."
- **On** — switch checked, subtext "…are included when generating AI insights."
- **Consent dialog open** — title "Share {noun} with AI?", 3-paragraph disclaimer, Cancel + "Enable insights" buttons.
- **Info dialog open** — title "About AI insights", same disclaimer, single "Got it" button.
- **Pre-consent vs post-consent** — pre-consent (any field), turning a toggle on routes through the dialog; post-consent toggles flip instantly.

### Offline / sync
- Fully usable offline; conditions stay on-device by default. Writes go through `writeWithSync` and trigger `schedulePush()`, so the profile backs up and cloud-syncs like any other table when authenticated (no profile-specific offline/syncing badges on this page).

### Toast
- Destructive toast only for the over-limit case.

---

## Enums, options & configurable values

| Name | Value | Source |
|---|---|---|
| `MAX_CONDITIONS` | `20` | `profile-service.ts` (re-exported via hook) |
| `MAX_CONDITION_LENGTH` | `120` | `profile-service.ts` (also `Input maxLength`) |
| Consent toggle fields (`ToggleField`) | `"shareConditionsWithAI"` \| `"shareMedicationsWithAI"` | `ai-insights-consent-toggle.tsx` |
| Toggle 1 label / noun | "Share conditions with AI insights" / "conditions" | `medical-context-section.tsx`, `medical-ai-section.tsx` |
| Toggle 2 label / noun | "Share medications with AI insights" / "medications" | same |
| Dialog modes | `"consent"` \| `"info"` (state `null` = closed) | `ai-insights-consent-toggle.tsx` |
| Condition input placeholder | "e.g. HFrEF, idiopathic dilated cardiomyopathy" | `medical-context-section.tsx` |
| Nav route | path `/profile`, icon `CircleUser`, label "Profile", title "Profile", subtitle "Account & medical context" | `nav-routes.ts` |
| Dexie table version | `userProfile` introduced at Dexie **v18** | `profile-service.ts` doc comment |
| Default sharing flags | both `false`, `aiInsightsConsentAt: null` | `emptyProfile()` |
| Medication summary cap (downstream) | first **40** active prescriptions | `buildMedicationSummary()` |
| `MedicationSchema.phaseType` enum (downstream) | `"maintenance"` \| `"titration"` | `analytics-insights.ts` |
| `ProfileSchema` validation caps (downstream) | conditions: ≤20 strings (1–120 chars each); medications: ≤40 | `analytics-insights.ts` |
| `MedicationSchema` field limits (downstream) | name 1–120, dose 1–80, frequency 1–120, daysOnPhase int ≥0 | `analytics-insights.ts` |
| Day names (medication frequency rendering) | `["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]` | `analytics-snapshot.ts` |
| Frequency phrasing | 1 schedule → "once", 2 → "twice", n → "{n}x"; ≥7 days → "{per} daily" else "{per} on {days}" | `analytics-snapshot.ts` |

Icons used on this page: `HeartPulse` (rose), `Plus`, `X`, `Info`, `LogIn`, `Sparkles` (amber), `Bell` (blue), `CloudUpload` (emerald), `LogOut`, `Loader2`, `CircleUser` (nav).

---

## Data model touched

### `UserProfile` (Dexie `db.userProfile`, `db.ts` L383–393) — treated as a singleton
| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Empty string in `emptyProfile()` = not-yet-persisted; real id assigned on first write via `generateId()` |
| `conditions` | `string[]` | User-reported medical conditions, e.g. "HFrEF" |
| `shareConditionsWithAI` | `boolean` | Opt-in to include conditions in AI insights |
| `shareMedicationsWithAI` | `boolean` | Opt-in to include active medications in AI insights |
| `aiInsightsConsentAt` | `number \| null` | First-consent Unix-ms timestamp; `null` = never consented |
| `createdAt` | `number` | Unix ms |
| `updatedAt` | `number` | Unix ms; newest-updated active row wins |
| `deletedAt` | `number \| null` | Soft-delete tombstone; `null` = active |
| `deviceId` | `string` | From `getDeviceId()` |

### Server mirror — `userProfile` pgTable (`schema.ts` L646–671)
- Table `user_profile`, PK `id`, FK `user_id` → `usersSync.id` (cascade delete).
- `conditions` text[] NOT NULL; `share_conditions_with_ai` boolean NOT NULL; `share_medications_with_ai` boolean NOT NULL DEFAULT false (`.default(false)` keeps the ADD COLUMN migration safe on existing rows); `ai_insights_consent_at` bigint nullable; `created_at`/`updated_at` bigint NOT NULL; `deleted_at` bigint nullable; `device_id` text NOT NULL.
- Index `idx_user_profile_user_updated` on `(user_id, updated_at)`.

### Service / hook surface
- `getUserProfile()` — reads all rows, filters `deletedAt === null`, sorts by `updatedAt` desc, returns `{ ...emptyProfile(), ...row }` (spread guarantees every field defined even on legacy rows) or `emptyProfile()`.
- `saveUserProfile(updates: ProfileUpdates)` — upsert; assigns id on first write, normalizes conditions when provided, bumps `updatedAt`, writes via `writeWithSync("userProfile","upsert", …)`, then `schedulePush()`. Returns `ServiceResult<UserProfile>`.
- `ProfileUpdates` — partial: `{ conditions?, shareConditionsWithAI?, shareMedicationsWithAI?, aiInsightsConsentAt? }`.
- `useUserProfile()` — `useLiveQuery(getUserProfile, [], emptyProfile())`.
- `useSaveProfile()` — `useMutation` wrapping `saveUserProfile` through `unwrap`.

### Read by (downstream, not written here)
- `ai-insights-card.tsx` / `nutrient-analysis-card.tsx` each read the two boolean sharing flags (`shareConditionsWithAI`, `shareMedicationsWithAI`) + `conditions`. Neither card reads `aiInsightsConsentAt`.
- `buildMedicationSummary()` reads active prescriptions/phases/schedules to build the medication snapshot only when `shareMedicationsWithAI` is on.

---

## Validation, edge cases & business rules

- **Condition normalization** (`normalizeConditions`): trim each → slice to `MAX_CONDITION_LENGTH` (120) → drop blanks → dedupe case-insensitively (lowercased key) → clamp to `MAX_CONDITIONS` (20, breaks early). Applied on every save where `conditions` is provided.
- **Add-time UI guards** (`addCondition`): empty/whitespace returns early; at 20 → destructive toast, no save; case-insensitive duplicate → silently clears draft, no save.
- **Singleton resolution**: multiple active rows can briefly exist after a concurrent multi-device first write; newest `updatedAt` wins. Legacy rows missing newer fields (e.g. `shareMedicationsWithAI`) are backfilled by spreading over `emptyProfile()`.
- **First-write id assignment**: `id: current.id || generateId()` — blank id from `emptyProfile()` becomes a real id only on first persist.
- **Consent gating**: nullish check `aiInsightsConsentAt != null` (both `null` and missing/`undefined` count as not-yet-consented; `!== null` alone would let `undefined` bypass the gate). Consent is recorded once and covers every sharing toggle thereafter; turning a toggle on never re-prompts after the first consent.
- **Consent dialog is the opt-in**: turning a switch on pre-consent does not persist `field=true` until "Enable insights"; Cancel/dismiss leaves the switch off.
- **Sharing is two-gated downstream**: conditions only flow to AI when `shareConditionsWithAI === true` AND `conditions.length > 0`; medications flow when `shareMedicationsWithAI === true` (medication content gathered live from active prescriptions, capped at 40).
- **Data minimization**: only structured labels (short condition strings) and structured prescription summaries reach the AI — never raw records, notes, or free text. Minimization on this path is purely *by construction* — the snapshot is aggregate numbers + short condition labels + structured med summaries, so no PII reaches the request to begin with. The insights route (`src/app/api/analytics/insights/route.ts`) does **not** run a server-side scrub/strip/sanitize step on this payload.
- **Days-on-phase** (downstream): `max(0, floor((now - phase.startDate)/MS_PER_DAY))`.
- **Timestamps** are Unix-ms (`Date.now()`); no day-start/timezone logic applies to the profile itself.

---

## Sub-components / variants

| File / component | Purpose |
|---|---|
| `app/profile/page.tsx` → `ProfilePage` | Top-level route; composes Account + Medical context sections. |
| `app/profile/page.tsx` → `SignedOutBlurb` | Page-level not-signed-in card with benefits list + Sign In CTA. |
| `settings/account-section.tsx` → `AccountSection` | Shared account widget: spinner / not-signed-in / signed-in (email + Sign Out). |
| `profile/medical-context-section.tsx` → `MedicalContextSection` | Conditions card: chips, add input/button, both consent toggles, medication-sharing note. |
| `profile/ai-insights-consent-toggle.tsx` → `AiInsightsConsentToggle` | Reusable per-field opt-in switch with first-time consent dialog + info dialog. |
| `profile/ai-insights-consent-toggle.tsx` → `DisclaimerBody` | Shared 3-paragraph disclaimer for consent + info dialogs. |
| `profile/ai-insights-consent-toggle.tsx` → `fieldUpdate` | Builds a typed single-field `ProfileUpdates` without an unsafe computed-key cast. |
| `settings/medical-ai-section.tsx` → `MedicalAiSection` | Settings → Privacy & Security mirror of both consent toggles (no condition editing). Has its own emerald "Medical conditions & AI" heading (`HeartPulse` icon) and footer copy: "Add or remove the conditions themselves on your Profile page. Medications come from your Medications page." |
| `hooks/use-profile-queries.ts` | `useUserProfile` (live read) + `useSaveProfile` (mutation); re-exports limits/types. |
| `lib/profile-service.ts` | CRUD, `emptyProfile`, `normalizeConditions`, limits, sync wiring. |
