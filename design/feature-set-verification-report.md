# Feature-Set Verification — Master Report

Consolidated from 47 per-unit adversarial verification reports under
`design/feature-set/verification/00-*.md … 46-*.md`. Each per-unit report checked one
feature-set doc against the real source code, recording **Inaccuracies** (doc claim vs code
reality, with severity + file:line) and **Omissions** (real behaviors/states/enums the doc
missed). This report aggregates only what those 47 files contain.

---

## 1. Executive Summary

| Metric | Value |
|---|---|
| Units verified | **47** (docs 00–46) |
| Total claims checked | **4,220** |
| Total claims verified | **4,002** |
| **Overall verified % (accuracy)** | **94.8%** |
| Total inaccuracies | **182** |
| Total omissions | **309** |
| Total findings | **491** |

**Inaccuracies by severity:** 3 high · 34 medium · 145 low.
**Omissions by severity:** 0 high · 8 medium · 301 low.

**Per-unit verdicts:** 19 *accurate* · 28 *minor-gaps* · 0 *significant-gaps*.

**Overall verdict:** The brief is **highly reliable**. At 94.8% verified across 4,220
digit-checked claims, numeric values (presets, thresholds, defaults, enum members, color
tokens, schema fields) are overwhelmingly correct — most discrepancies are low-severity
wording nuances or scoping omissions. The defects that matter for a design rebuild cluster
into a few repeating patterns: (a) **dead/orphaned features the doc presents as live**
(weight-graph overlays, `dataRetentionDays`, irregular-heartbeat in dialogs, substance-enrich
voice flow, `outlineText`), (b) **unreachable loading/skeleton states** caused by
`useLiveQuery` truthy defaults, and (c) the deprecated `time` field being displayed instead of
the timezone-aware `scheduleTimeUTC`. Only **3 high-severity** items exist, all simple factual
fixes. No unit was rated *significant-gaps*.

---

## 2. Per-Unit Verdict Table (worst-first)

Sorted significant-gaps → most inaccuracies → most omissions. (No unit is significant-gaps;
ordering within minor-gaps is by #inaccuracies then #omissions.)

| Unit | Verdict | Claims | Verified | #Inacc | #Omis |
|---|---|---:|---:|---:|---:|
| 23 analytics-records | minor-gaps | 92 | 84 | 7 | 6 |
| 01 liquids-water-input | minor-gaps | 118 | 110 | 6 | 9 |
| 31 data-storage-settings | minor-gaps | 92 | 84 | 6 | 9 |
| 46 substances | minor-gaps | 96 | 88 | 6 | 9 |
| 15 prescriptions | minor-gaps | 78 | 72 | 6 | 7 |
| 41 push-notifications | minor-gaps | 78 | 71 | 6 | 7 |
| 02 food-salt-ai-input | minor-gaps | 78 | 73 | 6 | 6 |
| 36 nav-chrome | minor-gaps | 96 | 90 | 5 | 10 |
| 08 recent-entries-edit | minor-gaps | 96 | 89 | 5 | 8 |
| 10 card-shell-theming | minor-gaps | 88 | 81 | 5 | 8 |
| 32 privacy-system-settings | minor-gaps | 88 | 82 | 5 | 8 |
| 17 dose-logging | minor-gaps | 96 | 90 | 5 | 7 |
| 42 backup-migration | minor-gaps | 92 | 84 | 5 | 7 |
| 06 defecation | minor-gaps | 78 | 72 | 4 | 11 |
| 11 voice-entry | minor-gaps | 118 | 112 | 4 | 9 |
| 30 ai-keys-security | minor-gaps | 118 | 110 | 4 | 9 |
| 09 history-drawer | minor-gaps | 95 | 89 | 4 | 8 |
| 04 weight | minor-gaps | 96 | 89 | 4 | 6 |
| 22 analytics-correlations | minor-gaps | 88 | 83 | 4 | 6 |
| 40 settings-store-enums | minor-gaps | 118 | 113 | 4 | 6 |
| 28 tracking-settings | minor-gaps | 86 | 82 | 4 | 5 |
| 29 customization-settings | minor-gaps | 78 | 74 | 4 | 5 |
| 35 help-manual | minor-gaps | 78 | 74 | 4 | 5 |
| 03 blood-pressure | minor-gaps | 92 | 86 | 3 | 6 |
| 18 inventory | minor-gaps | 78 | 75 | 3 | 6 |
| 19 edit-medication | minor-gaps | 78 | 73 | 3 | 6 |
| 45 mcp-server | minor-gaps | 120 | 117 | 3 | 5 |
| 00 overview | minor-gaps | 41 | 38 | 3 | 3 |
| 21 analytics-summary | accurate | 118 | 113 | 5 | 8 |
| 44 debug-tools | accurate | 96 | 92 | 4 | 9 |
| 14 compound-library | accurate | 78 | 74 | 4 | 7 |
| 16 titrations | accurate | 96 | 93 | 4 | 6 |
| 07 text-metrics-summary | accurate | 78 | 74 | 4 | 5 |
| 39 data-model-enums | accurate | 121 | 117 | 3 | 8 |
| 13 add-medication-wizard | accurate | 96 | 92 | 3 | 7 |
| 37 global-dialogs-feedback | accurate | 96 | 93 | 3 | 7 |
| 20 medication-settings-tz | accurate | 78 | 75 | 3 | 6 |
| 24 analytics-titration-tab | accurate | 78 | 75 | 3 | 6 |
| 26 analytics-engine | accurate | 96 | 93 | 3 | 6 |
| 33 profile-medical-context | accurate | 78 | 75 | 3 | 5 |
| 27 settings-shell | accurate | 78 | 75 | 3 | 4 |
| 05 urination | accurate | 78 | 76 | 2 | 6 |
| 25 analytics-controls-export | accurate | 78 | 77 | 2 | 6 |
| 12 meds-schedule | accurate | 96 | 95 | 2 | 4 |
| 34 auth | accurate | 96 | 94 | 2 | 4 |
| 43 daily-notes | accurate | 47 | 46 | 1 | 3 |
| 38 sync | accurate | 88 | 88 | 0 | 5 |

> Note: unit 45 (mcp-server) reported "~120 claims, verified ~117" (approximate); counted as 120/117.

---

## 3. All HIGH-Severity Findings

There are exactly **3 high-severity inaccuracies** and **0 high-severity omissions**.

### H-1 · Unit 02 (food-salt-ai-input) — AI model misnamed "Opus", code uses Sonnet
- **Doc claim:** AI parse route + nutrient-analysis "Model: `CLAUDE_MODELS.quality` (Opus)".
- **Code reality:** `CLAUDE_MODELS.quality` is **`claude-sonnet-4-6` (Sonnet)**, not Opus. Opus is `CLAUDE_MODELS.premium` (`claude-opus-4-6`). The enum key cited is right; the parenthetical model name is wrong.
- **file:line:** `src/app/api/ai/_shared/claude-client.ts:25-28`; routes `src/app/api/ai/parse/route.ts:174`, `src/app/api/ai/nutrient-analysis/route.ts:220`.

### H-2 · Unit 00 (overview) — fabricated "Bristol scale" defecation requirement
- **Doc claim:** §3 "*Bristol type* … selectors render as tap-the-option segmented chips" and §7 lists "**Bristol types 1–7**" as a load-bearing functional contract.
- **Code reality:** No Bristol scale exists anywhere. `DefecationRecord` has only `amountEstimate` (small/medium/large) + free-text `note`. Repo-wide `grep -ri bristol src/` returns **zero** non-test hits. The card renders `DEFECATION_AMOUNT_OPTIONS` only.
- **file:line:** `src/lib/db.ts:124-134` (interface); `src/lib/constants.ts:88-92` (amount options); `src/components/defecation-card.tsx:33,138,176,188` (note placeholder).

### H-3 · Unit 46 (substances) — substance-enrich route misattributed to voice/"Other" flows
- **Doc claim:** substance-enrich "Backs voice/'Other' flows — free-text descriptions are sent to substance-enrich and the parsed values pre-fill an entry for confirmation."
- **Code reality:** No UI/voice flow calls `/api/ai/substance-enrich`. Its only caller is `runSubstanceEnrichment()`, a **background Pass-2 enrichment runner** that re-estimates v12-migrated records (`source='water_intake'`, `aiEnriched=false`). Voice creates substances via `addSubstance` using values from the **food-parse** AI, never substance-enrich.
- **file:line:** `src/lib/substance-enrich.ts:5-9,24,41`; `src/components/voice/voice-panel.tsx:240-258`; route has zero app callers.

---

## 4. All MEDIUM-Severity Findings (grouped by unit)

34 medium inaccuracies + 8 medium omissions. Format: doc-claim → code-reality → file:line.

### Unit 01 — liquids-water-input
- **Inacc:** "Custom time is past-only (`datetime-local max=now`) in both dialog **and edit form**" → the inline edit form (`InlineEditFormShell`) has **no `max`**; only the manual dialog caps. → `recent-entries-list.tsx:55,66`; `manual-input-dialog.tsx:186`.
- **Inacc:** "Standard drinks rounded to 1 decimal" as a flat rule → true for live display + `buildComposableEntry` (`toFixed(1)`), but the **edit-form sync path rounds to 2 dp** (`standardDrinksFromAbv(...).toFixed(2)`). → `preset-tab.tsx:291`; `composable-entry-service.ts:711`.

### Unit 02 — food-salt-ai-input
- **Inacc:** "Recent entries list — last **5** eating records" → `FoodSection` fetches 5 but renders via `RecentEntriesList` without `maxEntries`, so it slices to default **3 rows displayed**. → `food-section.tsx:101,555-561`; `recent-entries-list.tsx:105,112`.
- **Inacc:** "Tap **edit (pencil)** on a recent row" → there is **no pencil/edit icon**; the whole row is a clickable `role="button"`; only per-row icon is `Trash2` delete. → `recent-entries-list.tsx:130-171`.

### Unit 03 — blood-pressure
- **Inacc:** "Loading skeleton in header while live query undefined" → `useBloodPressureRecords` seeds `useLiveQuery` with `[]` default, so `recentRecords` is never undefined; the header skeleton branch is **dead code that never renders**. → hook `use-health-queries.ts:118-120`; card `blood-pressure-card.tsx:64-65,200-204`.
- **Omis:** No real consumer passes `onIrregularHeartbeatChange`, so the dialog's "Irregular Heartbeat" Select **never renders** in production (History/Analytics edit flows omit the prop). → `edit-blood-pressure-dialog.tsx:163`; `history-drawer.tsx:318-337`; `analytics/records-tab.tsx:480-499`.

### Unit 04 — weight
- **Inacc:** `sanitizeNumericInput(value, fallback=0.05, max=1, decimals=2)` — 2nd arg called "fallback", range "roughly `(0,1]`" → signature is `(value, min=0, max=100000, precision?)`; `0.05` is **`min`** (hard floor), effective range **`[0.05, 1]`** (closed lower bound). → `src/lib/security.ts:56-65`; `settings-store.ts:421-422`.

### Unit 06 — defecation
- **Inacc:** "raises a 5-second 'Record deleted' toast" / "'Entry deleted'" implies one delete toast → **two** toasts fire: `useDeleteWithToast` ("Entry deleted" / "Defecation record removed") AND `useUndoDeleteMutation` undo toast ("Record deleted"). → `use-delete-with-toast.ts:26-29`; `use-undo-delete-mutation.ts:21-23`; `defecation-card.tsx:50`.
- **Omis:** Delete fires TWO toasts, not one; the undo toast carries `duration:5000` + Undo action calling `undoDeleteDefecationRecord`. → `use-delete-with-toast.ts:25-35`; `use-undo-delete-mutation.ts:19-24`; `undo-toast.tsx:23-28`.

### Unit 08 — recent-entries-edit
- **Omis:** `EditWeightDialog` and `EditBloodPressureDialog` are entirely **absent from "Files covered" and "Sub-components"**, yet both are core dialog-editor surfaces (rendered by history-drawer and records-tab). → `edit-weight-dialog.tsx`, `edit-blood-pressure-dialog.tsx`; rendered `history-drawer.tsx:306,318`, `records-tab.tsx:468,480`.

### Unit 09 — history-drawer
- **Inacc:** "Loading. `open && !historyData` → centered spinner" presented as reachable → `useHistoryData` seeds `useLiveQuery` with truthy `EMPTY_RESULT`, so `historyData` is never undefined; spinner branch is **unreachable**, and the empty state ("No records yet") shows during initial load instead. → `use-history-queries.ts:35-52`; `history-drawer.tsx:96,244-247`.

### Unit 10 — card-shell-theming
- **Inacc:** `progressGradient`/`progressExtended` token values listed as e.g. `from-sky-400 to-cyan-500` → every value is prefixed `bg-gradient-to-r ` in code (e.g. `"bg-gradient-to-r from-sky-400 to-cyan-500"`); doc drops the prefix throughout. → `card-themes.ts:49-50,70-71,91-92,112,237,258`.
- **Inacc:** `outlineText` listed as a real consumed token → `outlineText` is defined on all 11 themes but **never read** anywhere in `src/` (only `outlineBorder` is consumed). Dead/unused. → consumer: `preset-tab.tsx:607` (outlineBorder only).

### Unit 11 — voice-entry
- **Inacc:** "A null/short-circuit `apiFetch` response silently returns to `idle`" → `apiFetch` always returns a `Response` or throws; the `if (!transcribeRes)`/`if (!parseRes)` idle guards are **dead code** — no falsy/auth-redirect path exists. → `api-fetch.ts:61-95`; `voice-panel.tsx:83-86,100-103`.

### Unit 15 — prescriptions
- **Inacc:** Active-medicine mini-card shows pill icon "with a **count badge** via `PillIconWithBadge`" → `PillIconWithBadge` is invoked with no `status` prop, so **no badge renders**; and its badge is a *status* glyph, not a *count* badge. No count-badge feature exists. → `prescription-card.tsx:176-180`; `pill-icon.tsx:63-95`.
- **Inacc:** Schedule summary "at {times}" driven by `scheduleTimeUTC` (the authoritative time) → the expanded summary renders the **deprecated `s.time`** raw HH:MM string, not `scheduleTimeUTC`/`localTime` (unlike "Today" rows). → `compound-card-expanded.tsx:170,186`.

### Unit 17 — dose-logging
- **Inacc:** Header example "`Vymada 100mg (Sacubitril/Valsartan)`" implies a combo shows summed `100mg` → for a combo, `headerStrength = formatCompoundShort(...)` renders the **split per-compound** form (e.g. `49/51mg`), never a bare `100mg`. → `dose-detail-dialog.tsx:132-134`; `compound-utils.ts:57-63`.

### Unit 18 — inventory
- **Omis:** `BrandSwitchPicker` is a **second path** to set the active brand (deactivate current, activate selected), reached via "Switch Brand" on the expanded card. Doc treats Manage-tab "Set as active brand" as the only switch UI. → `brand-switch-picker.tsx:36,48,56`; `compound-card-expanded.tsx:257-267`.

### Unit 19 — edit-medication
- **Inacc:** "Saving a schedule triggers a notification resync (`resyncNotifications()` via schedule mutation hooks)" → ScheduleTab saves via `useUpdatePhase`/`useStartNewPhase`, **neither of which has `onSuccess: resyncNotifications`**. Only `useAddSchedule`/`useUpdateSchedule`/`useDeleteSchedule` are wired to resync, and those are NOT used by this drawer. **Saving a schedule does NOT resync notifications.** → `use-medication-queries.ts:170,178,185` vs `:189-199`; `edit-medication-drawer.tsx:165,177`.

### Unit 21 — analytics-summary
- *(All findings low; no medium items. Quick fixes appear under §5.)*

### Unit 22 — analytics-correlations
- **Inacc:** "Fluid-balance `FLUID_TARGET_ML = 500`" listed under the `analytics-types.ts` header (implying it's exported there) → it is **not** in `analytics-types.ts`; it's a private module constant duplicated locally in `correlations-tab.tsx` and again in `summary-tab.tsx`. → `correlations-tab.tsx:149`; `summary-tab.tsx:50`.

### Unit 23 — analytics-records
- **Inacc:** "potassium=Banana icon / label Potassium / unit mg" presented as what rows render → `RecordRow` computes `themeKey = water?…:sugar?…:"salt"` — **no potassium branch**; a potassium record renders with the **salt** theme (Sparkles icon, label "Sodium"). → `record-row.tsx:27-42`; theme `card-themes.ts:102-121`.
- **Inacc:** "`EditIntakeDialog` edits …/**potassium**" → dialog branches only on water/sugar/else; a potassium record opens titled "Edit **Sodium** Entry", unit mg, amber Save. → `edit-intake-dialog.tsx:43-52,114-122`.
- **Inacc:** "BP edit writes … `irregularHeartbeat`" → the BP submit handler **never writes `irregularHeartbeat`** (builds systolic/diastolic/heartRate/position/arm/timestamp/note only). → `records-tab.tsx:287`.
- **Inacc:** "Irregular heartbeat (conditional control) `no|yes`" listed as an editable BP dialog option → the control only renders when `onIrregularHeartbeatChange` is passed; the Records tab omits that prop, so it **never appears**. → `edit-blood-pressure-dialog.tsx:163`; `records-tab.tsx:480-499`.

### Unit 26 — analytics-engine
- **Inacc:** "`substanceRecords` … direct Dexie compound index (no substance-service yet)" → a `substance-service.ts` **does** exist (`getSubstanceRecordsByDateRange`); the parenthetical "no substance-service yet" is a stale comment inherited from source. (Code behaviour described is correct.) → `substance-service.ts:98`; stale comment `analytics-service.ts:37-38`.

### Unit 28 — tracking-settings
- **Inacc:** "Weight Graph Overlays seed the weight chart's initial overlay state" → `weightGraphShowEating/Urination/Defecation/Drinking` are written by the toggles but **read by nothing** — orphaned/write-only; no weight-chart component consumes them (none exists). → `settings-store.ts:87-90,210-213,400-403`; `weight-settings-section.tsx:101-124`.

### Unit 29 — customization-settings
- **Inacc:** "`validateAndSave` uses `parseFloat`+`.toString()`, so a typed decimal within range is stored as-is" → the store setter re-clamps through `sanitizeNumericInput(value,min,max)` with no precision arg → **rounds to integer**; a typed decimal is NOT stored as-is. → `src/lib/security.ts:56-65`; `settings-store.ts:387-396`.

### Unit 30 — ai-keys-security
- **Inacc:** "`sanitizeForAI` applied in parse, substance-enrich, titration-warnings routes" reads as exhaustive → applied in **at least 8** AI routes (also nutrient-analysis, voice-parse, substance-lookup, medicine-search, interaction-check). → `nutrient-analysis/route.ts:140,194,204`; `voice-parse/route.ts:90`; `substance-lookup/route.ts:92`; `medicine-search/route.ts:162`; `interaction-check/route.ts:135`.

### Unit 31 — data-storage-settings
- **Inacc:** "`TABLE_PUSH_ORDER` … **19 tables**" → array has exactly **18** entries (source type comment also says "18"). → `sync-topology.ts:28-58`.
- **Inacc:** Import toast "Imported {n} records ({skipped} skipped[, {c} conflicts]) / Import failed: {msg}" → actual **title** is "Import successful"/"Import failed"; the strings cited conflate title and description. → `use-backup-queries.ts:57-68`.
- **Omis (code bug):** **Import-success toast under-counts** — `useUploadBackup` sums only 16 `*Imported` fields, omitting `userProfileImported` + `insightReportsImported`; toast total can be lower than the inline summary (which sums all 18). → `use-backup-queries.ts:40-56` vs `data-management-section.tsx:92-111`.

### Unit 32 — privacy-system-settings
- **Inacc:** Error logs read from "`auditLogs`/error-log table via `getErrorLogs()`" → they come from the `_errorLogs` Dexie table, not `auditLogs`. → `error-log-service.ts:111-113`.
- **Inacc:** "Hook defaults (global wiring fallback): threshold=8, requiredJolts=3 …" → the global `ShakeToReport` always passes store values (defaults **10/5**); the 8/3 hook fallbacks are never used there. → `shake-to-report.tsx:17-27`; `use-shake-gesture.ts:119-126`; `settings-store.ts:218-220`.

### Unit 35 — help-manual
- **Inacc:** "**Manuals (`MANUALS`, 14 total)**" → there are exactly **13** manuals (the doc's own table lists 13 rows). → `src/lib/help/manuals.ts:129-601`.

### Unit 40 — settings-store-enums
- **Inacc (code bug):** "`dataRetentionDays` governs pruning" → `dataRetentionDays`/`setDataRetentionDays` have **zero consumers** anywhere; `runExpiryCheck(retentionDays)` is never called or fed the setting. The field is **dead** — governs nothing. → `settings-store.ts:62,378-379`; orphan param `push-notification-service.ts:98,232`.

### Unit 41 — push-notifications
- **Inacc:** 60s `setInterval` "drives both dose AND refill checks; refill at most once per 12h" → the interval callback calls **only `checkDoseReminders()`**; `checkRefillAlerts()` runs once at startup. The 12h throttle only matters across sessions. → `medication-notification-service.ts:199-204`.
- **Inacc:** Notification `tag` set = `dose-{HH:MM}` / `expiry-reminder` / `test-notification` → the **in-app** dose reminder uses a different tag `dose-reminder-{HH:MM}` and refill uses `refill-{id}`; in-app and push dose notifications do **not** collapse together. → `medication-notification-service.ts:45,55`; `send/route.ts:69`; `check/route.ts:57`.

### Unit 42 — backup-migration
- **Omis:** **`verifyMigration` / `verifying` phase / `verificationResults` are not wired into production.** The wizard never sets `verifying`, never calls `verifyMigration`, and `completeMigration` does not verify before finalizing — exercised only by unit tests. Integrity verification is effectively dormant (no verify screen/button/pass-fail UI). → `migration-service.ts:184-228`; `migration-wizard.tsx` (no verifying branch); `migration-service.test.ts:258,294`.
- **Omis:** **Encrypted backup has no UI.** `exportEncryptedBackup`/`importEncryptedBackup` + the entire `crypto.ts` PIN path are referenced only by tests — no PIN field, no encrypt toggle; unreachable from current UI. → `backup-service.ts:278,300`.
- **Inacc (code bug):** Import-success toast total sums only 16 counters (omits `userProfileImported` + `insightReportsImported`) → undercounts. → `use-backup-queries.ts:40-56` vs `data-management-section.tsx:92-111`.

### Unit 45 — mcp-server
- **Inacc:** "read-only MCP tool registry (**7 tools**)" → the registry registers **8** tools; the doc's own numbered list runs 1–8, contradicting the "7" count. → `src/lib/mcp/tools.ts:122-268`.

### Unit 46 — substances
- **Inacc:** "Correlation unit suffixes: caffeine ' mg', alcohol ' drinks'" → the dedicated **Alcohol vs BP** card uses `unitA=" units"`, not `" drinks"` (the `" drinks"` suffix exists only in the generic `DOMAIN_UNITS` map). → `correlations-tab.tsx:404` (units) vs `:77` (DOMAIN_UNITS drinks).
- **Omis:** `src/lib/substance-enrich.ts` (`runSubstanceEnrichment`, the sole caller of the substance-enrich route) is **not in "Files covered"** at all — batches of 5, 1s delay, best-effort skip on non-OK. → `substance-enrich.ts:19,33-95`.

---

## 5. Prioritized FIX LIST (highest-impact first)

Quick = one-line string/number/label correction. Re-check = needs a fresh code read or a
design decision (e.g. whether to document a dead feature or have engineering remove it).

### Tier A — Factual errors that mislead (do first)
1. **[Quick] Unit 02:** change AI parse / nutrient model name "Opus" → **"Sonnet" (`claude-sonnet-4-6`)**. (`CLAUDE_MODELS.quality`.)
2. **[Re-check] Unit 00:** delete the **"Bristol type / Bristol types 1–7"** content entirely; defecation has only small/medium/large + free-text note.
3. **[Re-check] Unit 46:** rewrite substance-enrich purpose — it is a **background Pass-2 enrichment runner** for v12-migrated records, **not** a voice/"Other" entry flow. Add `substance-enrich.ts` to coverage.
4. **[Quick] Unit 35:** "14 manuals" → **13**.
5. **[Quick] Unit 45:** "7 tools" → **8** (all four mentions).
6. **[Quick] Unit 31:** "`TABLE_PUSH_ORDER` 19 tables" → **18**.

### Tier B — Dead / orphaned features presented as live (collapse duplicates; flag to eng)
7. **[Re-check] Units 28 + 40:** the **weight-graph overlay booleans** (`weightGraphShow*`) and **`dataRetentionDays`** are write-only/dead — no consumer. Stop describing them as functional; route to engineering (see §6).
8. **[Quick] Unit 10:** `outlineText` is a **dead token** (defined, never read) — remove from the "consumed tokens" list. Also prefix every `progressGradient`/`progressExtended` value with `bg-gradient-to-r `.
9. **[Re-check] Units 03 + 08 + 23:** the **irregular-heartbeat Select in `EditBloodPressureDialog` never renders** (no consumer passes `onIrregularHeartbeatChange`); BP edit never writes `irregularHeartbeat`. Mark the control as not-wired in the BP/edit/records docs. Also add the missing `EditWeightDialog`/`EditBloodPressureDialog` to unit 08's coverage.

### Tier C — Unreachable states from `useLiveQuery` truthy defaults
10. **[Re-check] Units 03 + 09:** remove or re-label the **header loading skeleton (BP card)** and **history-drawer loading spinner** — both are unreachable because the hook seeds a non-undefined default; the **empty state shows during load** instead.

### Tier D — Deprecated `time` vs `scheduleTimeUTC` display (recurring across med units)
11. **[Quick] Units 14 + 15 + 16 + 17 + 19:** schedule-summary lines display the **deprecated `s.time` HH:MM string**, not the timezone-aware `scheduleTimeUTC`/`localTime` used by "Today" rows. Note this divergence (or flag the inconsistency to eng).

### Tier E — Toast / two-toast and label nuances (numerous, low-risk)
12. **[Quick] Units 01 + 02 + 06 (+ recent-list family):** deleting a recent entry fires **two** toasts (undo "Record deleted" + plain "Entry deleted / <domain> record removed"), not one. Standardize the delete-toast description.
13. **[Quick] Units 02 + 03 + 04:** "recent list shows 5" → **3 rendered** (cards fetch 5, list slices to `maxEntries=3`). The "pencil/edit icon" is a **row click**, no pencil exists (unit 02).
14. **[Quick] Unit 23:** **potassium intake rows render with the salt/"Sodium" theme** (Sparkles icon), and `EditIntakeDialog` titles a potassium edit "Edit Sodium Entry" — no potassium branch in row/dialog.
15. **[Quick] Unit 19:** "saving a schedule resyncs notifications" is **false** for this drawer (phase mutations lack `onSuccess: resyncNotifications`).
16. **[Quick] Units 31 + 32:** error logs come from **`_errorLogs`**, not `auditLogs`; import/export toast titles are "…successful"/"…failed", not "…failed: {msg}".
17. **[Quick] Unit 32:** shake "global wiring fallback 8/3" → store defaults **10/5** win.
18. **[Quick] Unit 46:** correlation alcohol card suffix is `" units"`, not `" drinks"`.
19. **[Quick] Units 20 + 41:** country picker count "~195" → **194 ISO (+1 sentinel)** (unit 20) / **196 + 1 global** (unit 41) — pick the accurate figure.
20. **[Quick] Unit 42:** "clear all data = destructive wipe" → it's a **soft-delete (tombstones) of `intakeRecords` only**.
21. **[Quick] Unit 36:** "0.5px active-tab indicator" → **2px** (`h-0.5` token); card-theme icon colors are dual light/dark.
22. **[Quick] Unit 04:** weight `sanitizeNumericInput` 2nd arg is **`min` (floor 0.05)**, not "fallback"; range is `[0.05,1]`. Top-right timestamp is **absolute** (`formatDateTime`), not relative.
23. **[Quick] Unit 11:** the `apiFetch`-falsy idle branch is **dead code** — `apiFetch` never returns falsy.
24. **[Quick] Unit 15:** the active-medicine mini-card has **no count badge**.
25. **[Quick] Unit 41:** the 60s loop drives **dose checks only**; refill runs once at startup.

---

## 6. Code Bugs / Dead Code Surfaced (route to engineering — SOURCE problems, not doc problems)

1. **Import-success toast under-counts (latent bug).** `useUploadBackup` sums only 16 of the
   18 `*Imported` counters — omits `userProfileImported` and `insightReportsImported`, so the
   toast total can be lower than the inline "Last import: N new" summary (which sums all 18).
   → `src/hooks/use-backup-queries.ts:40-56` (units 31, 42).
2. **`dataRetentionDays` is fully dead.** The setting + `setDataRetentionDays` have zero
   consumers; `runExpiryCheck(retentionDays)` is never invoked. Either wire retention pruning or
   remove the orphaned setting. → `settings-store.ts:62,378-379`; `push-notification-service.ts:98,232` (unit 40).
3. **Weight-graph overlay booleans are write-only.** `weightGraphShowEating/Urination/Defecation/Drinking`
   are persisted and exposed via four toggles but read by no chart (no weight-chart component
   exists). Dead settings UI. → `settings-store.ts:87-90,210-213`; `weight-settings-section.tsx:101-124` (unit 28).
4. **`outlineText` card-theme token is dead.** Defined on all 11 themes, never read in `src/`.
   → `card-themes.ts` (unit 10).
5. **Migration integrity verification is dormant.** `verifyMigration` / the `verifying` phase /
   `verificationResults` are never reached in production (only unit tests call them);
   `completeMigration` finalizes without verifying. → `migration-service.ts:184-228` (unit 42).
6. **Encrypted backup has no UI.** `exportEncryptedBackup`/`importEncryptedBackup` + `crypto.ts`
   PIN path are test-only; no PIN entry / encrypt toggle exists. `replace` import mode is also
   unreachable (UI hard-codes `mode:"merge"`). → `backup-service.ts:278,300`; `data-management-section.tsx:62` (unit 42).
7. **Irregular-heartbeat dialog control never renders.** `EditBloodPressureDialog`'s "Irregular
   Heartbeat" Select is gated on `onIrregularHeartbeatChange`, which no real consumer passes; BP
   edit handler never writes `irregularHeartbeat`. → `edit-blood-pressure-dialog.tsx:163`;
   `records-tab.tsx:287,480-499` (units 03, 08, 23).
8. **Unreachable loading/skeleton states.** BP card header skeleton and history-drawer loading
   spinner are dead branches — `useLiveQuery` seeds a truthy default (`[]` / `EMPTY_RESULT`), so
   the empty state renders during load instead. → `use-health-queries.ts:118-120`;
   `use-history-queries.ts:35-52` (units 03, 09).
9. **More dead/stub code:** `dataPointsToCSVRows` is dead — defined `export-service.ts:30`,
   referenced nowhere (unit 25). `recalculateFromCurrentValues` is a deferred stub that always
   errors (`composable-entry-service.ts:818-824`, unit 46). `getBackupStats` is exported/tested
   but consumed by no component (`backup-service.ts:638`, unit 42).
10. **Inert columns / unused variants:** `mcp_oauth_clients.last_used_at` is never written
    (`schema.ts:985`); the global `getDueNotifications` push-db variant appears unused — the
    per-user variant is used everywhere (`push-db.ts:38-66`) (units 45, 41).
11. **Stale source comments (no runtime effect, but mislead future editors):**
    `backup-service.ts:2` says "17 data tables" (actual 18); `sync-engine.ts:12` says "≤200
    ops/cycle" (actual `PUSH_BATCH_CAP=50`); `analytics-service.ts:37-38` says "no substance-service
    yet" (it exists); `db.ts:910` PREVIEW_STORES says "v19" (actual `DB_SCHEMA_VERSION=21`);
    `schema.ts:1` header says "29 tables" (actual 31); `token/route.ts:6` says it "rotates the
    refresh token" (it deliberately keeps the same one) (units 26, 31, 38, 39, 45).
12. **Help-manual copy mismatch.** The settings manual references a `"How does this work?"` link
    that doesn't exist; the real dialog reads "Wanna read the manual?" / "Open the manual".
    → `manuals.ts:596` vs `report-bug-dialog.tsx:365,380` (unit 35).

---

## 7. Low-Confidence / Needs-Human-Eyes (verifier-flagged ambiguities)

- **"~5s undo toast" exactness (units 00, 01, 08).** `duration: 5000` is confirmed in
  `showUndoToast`, but the per-call timing for the *recent-entry* undo and whether the stacked
  two-toast UX is intended vs redundant is a **design question, not code-checkable**.
- **`apiFetch` falsy/auth-redirect path (unit 11).** The idle branches are dead against *current*
  `api-fetch.ts`; the verifier did not trace git history to see whether the doc reflects a
  now-removed `null`-on-redirect behavior. Treated as a current-code inaccuracy.
- **Server-side PII stripping vs by-construction minimization (units 30, 32, 33).** Multiple docs
  say identifying details are "stripped server-side before external AI calls." Confirmed for the
  bug-report and several AI routes; **but the analytics-insights path does no active scrub** —
  minimization there is purely by-construction (aggregate numbers + short labels). The
  client-side bug-report description is sent raw and only redacted server-side. Needs a human
  call on whether the doc's "stripped before sending" wording is acceptable.
- **Medical-standard provenance (unit 03).** The BP "ESH 2023 / Withings device scale" framing
  restates a code comment; the medical-standard claim itself was not independently verified
  against any spec — only that thresholds and comment are internally consistent.
- **Upstream package internals (units 34, 45).** Better Auth / Neon Auth `resetPassword`
  semantics, the MCP `WWW-Authenticate` header string, and Streamable-HTTP `DELETE`
  session-termination are produced by `@neondatabase/auth` / `mcp-handler` / `@modelcontextprotocol/sdk`,
  not repo code. Wiring is confirmed; runtime guarantees were not inspected in `node_modules`.
- **End-to-end sync/offline behavior (units 06, 13, 17, 23, 46).** `writeWithSync` +
  `schedulePush` + `enqueueInsideTx` call sites are confirmed, but the full sync-engine
  round-trip (Neon Postgres mirroring, cursor advance under DST) lives outside the per-unit file
  sets and was taken on trust.
- **`~195` country count tolerance (units 20, 41).** Both flagged the hedged "~195" as off by a
  digit (194+1 vs 196+1); within the "~" tolerance but the precise number differs — confirm which
  count to publish.
- **Deep-analysis wall-clock / batch pricing (units 21, 26).** "typically 3–10 min" and "batch =
  50% of standard pricing" are environment- and Anthropic-billing-dependent, asserted in code
  comments, not enforced by the codebase.
- **Optional-tracker persistence gating (units 28, 39, 40).** The claim that disabling a tracker
  *stops persisting new records of that type* (even AI-returned values) is consistent with the
  ~10 wired gating hooks but was not proven by tracing every writer's persist path.
