# Verification — 33-profile-medical-context

**Verdict:** accurate · checked 78 claims, verified 75.

Scope: read every "Files covered" source in full (`app/profile/page.tsx`, `medical-context-section.tsx`, `ai-insights-consent-toggle.tsx`, `use-profile-queries.ts`, `profile-service.ts`, `account-section.tsx`, `medical-ai-section.tsx`, `db.ts` UserProfile, `schema.ts` userProfile, `analytics-insights.ts`, `analytics-snapshot.ts`, `ai-insights-card.tsx`, `nav-routes.ts`) plus grepped the repo for the consumers (`nutrient-analysis-card.tsx`), the swipe-nav wiring (`swipe-nav.tsx`), the Dexie store/version definitions, the `PhaseType` enum, and the analytics insights API route. Implementations read in full, not just signatures. Every label, enum, default, threshold, and calculation cross-checked digit-for-digit.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "`ai-insights-card.tsx` / `nutrient-analysis-card.tsx` read the **three** sharing flags + `conditions`." (Data model → Read by) | Only **two** boolean sharing flags exist (`shareConditionsWithAI`, `shareMedicationsWithAI`). Both cards read exactly those two flags + `conditions`; neither reads `aiInsightsConsentAt`. The third "flag" does not exist. | `ai-insights-card.tsx:260-262`; `nutrient-analysis-card.tsx:203-205`; grep for `aiInsightsConsentAt` in both cards returns nothing |
| low | "Identifying details are stripped server-side before any external AI call (per app-wide PII policy)." (Validation → Data minimization) | There is no server-side PII-stripping step on this path. The insights route (`src/app/api/analytics/insights/route.ts`) does no scrub/strip/sanitize (grep finds none). Minimization is purely *by construction* — the snapshot is aggregate numbers + short condition labels + structured med summaries, so no PII reaches the request to begin with. The same doc bullet correctly states the by-construction minimization; the "stripped server-side" clause overstates an active step that doesn't run here. | `src/app/api/analytics/insights/route.ts` (no strip/scrub/sanitize); `analytics-snapshot.ts:1-7`, `analytics-insights.ts:1-16` |
| low | Nav listing: "one of the five swipeable top-level tabs (Intake / Medications / Analytics / Settings / Profile)." | Count (5) and swipeable-via-`NAV_ROUTES` are correct, but the actual array order is Profile, Intake, Meds, Analytics, Settings, and the medications tab **label** is `"Meds"` (not "Medications"). The parenthetical is a casual listing, not the registered-label claim (which the doc states correctly elsewhere as label "Profile"), so impact is cosmetic. | `nav-routes.ts:11-17`; `swipe-nav.tsx:11,40-47` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The consent toggle uses `htmlFor`/`id` pairing — each `Switch` gets `id={`toggle-${field}`}` and the `Label` an `htmlFor`. Accessibility wiring not mentioned (doc covers `aria-label`s elsewhere). | `ai-insights-consent-toggle.tsx:82,103,121` |
| low | The same `AiInsightsConsentToggle` is rendered in **two** places that share one Dexie singleton, so toggling on the Profile page and in Settings → Privacy & Security stay in lockstep via the live query. Doc notes the mirror exists but not the shared-live-state consequence. | `medical-ai-section.tsx:18-27`; `medical-context-section.tsx:126-135`; `use-profile-queries.ts:18-20` |
| low | `confirmConsent` persists `field=true` **and** `aiInsightsConsentAt` in a single `save(...)` (one upsert), and the info-dialog "Got it"/Cancel/dismiss all route through `setDialog(null)`. Doc captures the behavior in the actions table but not that consent is a single atomic write. | `ai-insights-consent-toggle.tsx:93-96` |
| low | `MedicalAiSection` has its own footer copy: "Add or remove the conditions themselves on your Profile page. Medications come from your Medications page." and a "Medical conditions & AI" emerald heading. Not in scope of the Profile page proper, but it is a listed covered file. | `medical-ai-section.tsx:14-16,29-32` |
| low | `nutrient-analysis-card.tsx` is a second downstream consumer that mirrors `ai-insights-card.tsx`'s `shareConditions`/`shareMedications`/`personalised` logic and "Your medical profile" check/X rows. Doc mentions it once in "Read by" but the downstream-effect section is written as if `ai-insights-card.tsx` is the only surfacing card. | `nutrient-analysis-card.tsx:203-206,479` |

## Spot-confirmed

- Page composition: `pb-10 space-y-6` outer; `Account` `h2` muted/sm/semibold; `{ready && !authenticated ? <SignedOutBlurb/> : <AccountSection/>}`; then `<MedicalContextSection/>`. `app/profile/page.tsx:54-60`.
- `SignedOutBlurb`: slate card, "You're not signed in", subtext, 3-item list (`CloudUpload` emerald / `Sparkles` amber / `Bell` blue) with the exact copy quoted in the doc, full-width Sign In → `/auth`. `app/profile/page.tsx:14-43`.
- `AccountSection` three states: `!ready` → `Loader2 animate-spin` spinner card; `!authenticated` → "Not signed in" card with `Sparkles`/`Bell`/`CloudUpload` ("AI food & drink parsing" / "Dose reminder notifications" / "Cloud sync across devices") + Sign In; authenticated → `user.email ?? "Signed in"`, "Signed in via Neon Auth", destructive `LogOut` Sign Out → `handleSignOut`. `account-section.tsx:13-74`.
- `MedicalContextSection`: "Conditions" title with `HeartPulse` rose; "Medical context" heading; exact explanatory copy; pill chips with `aria-label={`Remove ${c}`}`; `Input maxLength={MAX_CONDITION_LENGTH}` placeholder "e.g. HFrEF, idiopathic dilated cardiomyopathy"; `Plus` button `aria-label="Add condition"` `disabled={!draft.trim()}`. `medical-context-section.tsx:55-122`.
- Empty state: italic muted "No conditions added yet." `medical-context-section.tsx:94-96`.
- `addCondition` guards: empty returns early; `length >= MAX_CONDITIONS` → destructive toast "Limit reached" / "You can add up to 20 conditions."; case-insensitive duplicate → `setDraft("")` only, no save; else save `[...conditions, value]`. Enter key `preventDefault()`s. `medical-context-section.tsx:30-47,105-110`.
- `removeCondition` saves filtered list. `medical-context-section.tsx:49-51`.
- Toggle helper subtext exactly state-dependent: enabled → "Your {noun} are included when generating AI insights.", disabled → "Your {noun} stay on this device and are not sent to the AI." `ai-insights-consent-toggle.tsx:115-119`.
- Medication note copy verbatim. `medical-context-section.tsx:136-140`.
- Disclaimer body: 3 spans, copy matches the doc's three paragraphs word-for-word, rendered inside `DialogDescription`. `ai-insights-consent-toggle.tsx:44-64`.
- Consent gate: `hasConsented = profile.aiInsightsConsentAt != null` (nullish, as doc stresses); first enable w/o consent → `setDialog("consent")` and no save; `confirmConsent` saves `{...fieldUpdate(field,true), aiInsightsConsentAt: Date.now()}`. `ai-insights-consent-toggle.tsx:78-96`.
- Dialog titles: consent → `Share ${noun} with AI?`, info → "About AI insights"; consent footer Cancel + "Enable insights"; info footer single "Got it". `ai-insights-consent-toggle.tsx:132-150`.
- `fieldUpdate` returns a typed literal-key object (no computed-key cast). `ai-insights-consent-toggle.tsx:34-38`.
- `MAX_CONDITIONS = 20`, `MAX_CONDITION_LENGTH = 120`, re-exported via hook. `profile-service.ts:21,23`; `use-profile-queries.ts:14`.
- `emptyProfile()`: id "", conditions [], both share flags `false`, `aiInsightsConsentAt: null`, createdAt/updatedAt = now, deletedAt null, deviceId from `getDeviceId()`. `profile-service.ts:30-43`.
- `normalizeConditions`: trim → `.slice(0,120)` → drop blanks → lowercase-key dedupe → `break` at `>=20`. `profile-service.ts:46-59`.
- `getUserProfile`: filter `deletedAt === null`, sort `updatedAt` desc, `{ ...emptyProfile(), ...row }` spread (backfills legacy rows) else `emptyProfile()`. `profile-service.ts:66-75`.
- `saveUserProfile`: `id: current.id || generateId()`, conditional spreads per provided field, `updatedAt: Date.now()`, `writeWithSync("userProfile","upsert",…)` then `schedulePush()`, returns `ServiceResult`. `profile-service.ts:85-116`.
- `useUserProfile = useLiveQuery(getUserProfile, [], emptyProfile())`; `useSaveProfile` wraps `saveUserProfile` through `unwrap`. `use-profile-queries.ts:18-28`.
- `UserProfile` interface fields/types/comments match the doc's table exactly. `db.ts:383-393`.
- `userProfile` pgTable: table `user_profile`, PK `id`, `userId` FK → `usersSync.id` cascade, `conditions` text[] notNull, `share_conditions_with_ai` boolean notNull, `share_medications_with_ai` boolean notNull `.default(false)` (comment about ADD COLUMN safety present), `ai_insights_consent_at` bigint nullable, created/updated bigint notNull, deleted_at bigint nullable, device_id text notNull, index `idx_user_profile_user_updated` on (userId, updatedAt). `schema.ts:646-671`.
- Dexie `userProfile` introduced at **v18** (`realDb.version(18)` adds `userProfile: "id, updatedAt"`, doc-commented). `db.ts:783-809`; `profile-service.ts:1`.
- Downstream `ai-insights-card.tsx`: `shareConditions = shareConditionsWithAI && conditions.length > 0`; `shareMedications = shareMedicationsWithAI`; `personalised = shareConditions || shareMedications`; payload `...(shareConditions && { conditions })`, `...(shareMedications && { includeMedications: true })`; "Your medical profile" summary with `Check`/`X` rows. `ai-insights-card.tsx:260-263,286-287,503-540`.
- Prompt builder emits "User-reported medical conditions: {join '; '}." + do-not-diagnose line. `analytics-insights.ts:257-263`.
- `buildMedicationSummary`: cap `if (meds.length >= 40) break;`; `DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]`; frequency `count===1?"once":count===2?"twice":`${count}x``; `dayUnion.size >= 7 ? "{per} daily" : "{per} on {days}"`; `daysOnPhase = Math.max(0, Math.floor((now - phase.startDate)/MS_PER_DAY))`. `analytics-snapshot.ts:28,39-88`.
- `MedicationSchema.phaseType` enum `["maintenance","titration"]`; field bounds name 1–120, dose 1–80, frequency 1–120, daysOnPhase int ≥0; `ProfileSchema` conditions `≤20` of 1–120 chars, medications `≤40`. `analytics-insights.ts:95-112`.
- `PhaseType = "maintenance" | "titration"` confirms phase-type source. `db.ts:173`.
- Nav route entry: path `/profile`, icon `CircleUser`, label "Profile", title "Profile", subtitle "Account & medical context". `nav-routes.ts:12`.
- Profile is a swipeable top-level route (resolved from `NAV_ROUTES`, prev/next prefetch + pan-gesture commit). `swipe-nav.tsx:11,40-47,189-220`.
- Icons used: `HeartPulse` rose, `Plus`, `X`, `Info`, `LogIn`, `Sparkles` amber, `Bell` blue, `CloudUpload` emerald, `LogOut`, `Loader2`, `CircleUser` — all confirmed in their respective imports/usages.

## Low-confidence / could-not-verify

- "Timestamps are Unix-ms; no day-start/timezone logic applies to the profile itself." Confirmed the profile uses raw `Date.now()` with no day-start logic, and `schema.ts:643` explicitly notes "No `timezone` column — UserProfile omits it." Accurate.
- The doc's note (line 38) that `AccountSection`'s own not-auth branch is "the fallback when `ready && !authenticated` is false" — technically `AccountSection` renders whenever NOT(ready AND !authenticated), i.e. (not-ready OR authenticated); its internal not-auth branch only shows in transient/edge timing. Statement is consistent with the code, just terse. Not flagged.
- "newest-updated active row wins" / multi-device concurrent-write singleton resolution is asserted in code comments and matches the sort logic, but the actual concurrent-write race cannot be exercised statically. Logic is as documented.
