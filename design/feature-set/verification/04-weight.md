# Verification — 04-weight

**Verdict:** minor-gaps  ·  checked 96 claims, verified 89.

Adversarial read of every file in "Files covered" plus repo-wide greps for the weight card,
its theme, settings, schema, and help text. Implementations were read in full (not signatures).
The document is highly accurate — almost every value, label, threshold, and toast string matches
the code digit-for-digit. Findings below are a few mislabels and small overstatements.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | `sanitizeNumericInput(value, fallback=0.05, max=1, decimals=2)` — second arg called "fallback", effective range "roughly `(0, 1]`" (line 75) | Signature is `sanitizeNumericInput(value, min=0, max=100000, precision?)`. The `0.05` arg is **`min`**, not a "fallback". It clamps to `[0.05, 1]` (returns `min` only on NaN/Infinity — so 0.05 doubles as the NaN fallback, but it is also the hard floor). Effective range is **`[0.05, 1]`**, not `(0, 1]` — a value of 0.05 is reachable and values below 0.05 are clamped up, so the lower bound is closed at 0.05, not an open 0. | `src/lib/security.ts:56-65`; call site `src/stores/settings-store.ts:421-422` |
| low | "Top-right of the card shows the most recent record's weight ... plus a **relative**/formatted timestamp (`formatDateTime`)" (line 24) | `formatDateTime` produces an **absolute** calendar format `"Mon DD, h:mm AM/PM"` (e.g. "Jan 15, 2:30 PM") via `toLocaleString`. There is no relative ("2h ago") formatting anywhere in the path. | `src/lib/date-utils.ts:87-95` |
| low | "schedules a sync push" / "queue a push" phrasing implies deferred queueing (lines 30, 35, 67) | `addWeightRecord` calls `schedulePush()` synchronously right after the local write (`writeWithSync(...)` then `schedulePush()`); accurate as "schedules", just note it fires immediately, not batched on the card. Minor wording nit. | `src/lib/health-service.ts:24-28` |
| low | Enum section: "**No lbs/pounds** ... exists in code" (line 74) — scoped to the weight card, true; but worth flagging repo context | The weight **card** has no unit toggle (correct). However the help manual text claims a unit/target setting exists ("Choose kilograms or pounds, and set an optional target weight, under Settings → Tracking → Weight") which is itself stale — no such setting exists. The AI voice-parse route also converts lbs→kg in its prompt. Neither contradicts the card doc, but the blanket "no pounds in code" is not literally true repo-wide. | `src/lib/help/manuals.ts:309-310`; `src/app/api/ai/voice-parse/route.ts:29` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | `WeightFormSchema`'s `invalid_type_error: "Weight is required"` is the message Zod emits when `weight` is not a number; the doc lists it (line 79) but does not note that because `pendingWeight` is a guaranteed `number` before submit (null is guarded out), the "Weight is required" branch is effectively unreachable from the card UI — only "must be positive"/"seems too high" can fire. | `src/components/weight-card.tsx:15-19, 107-108` |
| low | Settings UI surface for `weightIncrement`: a dedicated `weight-settings-section.tsx` exposes the increment with floor **0.05**, ceiling **1**, decrement floor **0.05** (`decrementSetting(..., 0.05, 0.05, ...)`). The doc covers the store value but not that there is a real settings control with these bounds. | `src/components/settings/weight-settings-section.tsx:77-82` |
| low | `useLatestWeight()` hook exists (returns latest or null via `getWeightRecords(1)`) but is **not** used by `WeightCard` (the card derives `latestWeight` from `recentRecords[0]`). Doc's data-model section lists `useLatestWeight` among hooks (line 112) without noting the card itself doesn't call it. | `src/hooks/use-health-queries.ts:75-80`; `src/components/weight-card.tsx:89` |
| low | `InlineEditFormShell` supports a `labeled` prop (visible `<Label>`s) and `idPrefix`; the weight card uses the **default** unlabeled variant (placeholder + `aria-label`). Doc describes the shell generically but not that weight uses the unlabeled path. | `src/components/recent-entries-list.tsx:18-69`; weight card omits `labeled` at `weight-card.tsx:276` |
| low | `RecentEntriesList` keyboard handler guards `if (e.target !== e.currentTarget) return;` — Enter/Space only opens edit when the row itself (not a child like the delete button) is focused. Doc says "Enter/Space on the focused row also opens it" (line 47) but omits this target-equality guard. | `src/components/recent-entries-list.tsx:142-148` |
| low | Service layer: `getLatestWeightRecord()` is listed (line 110) but the card never calls it; also `addBloodPressureRecord`/BP CRUD live in the same `health-service.ts` (shared file) — doc correctly scopes to weight, no error, just noting shared module. | `src/lib/health-service.ts:52-55` |

## Spot-confirmed

- Stepper buttons `h-14 w-14 rounded-full`, Minus/Plus lucide icons — confirmed. `src/components/weight-card.tsx:179-224`
- `weightIncrement` default **0.05** — confirmed. `src/stores/settings-store.ts:215`
- Minus disabled when `pendingWeight === null || pendingWeight <= settings.weightIncrement`; Plus disabled only when `null` — confirmed exactly. `src/components/weight-card.tsx:183, 219`
- Decrement floor `Math.max(0.1, next)`; rounding `Math.round((prev ± inc) * 100) / 100` — confirmed. `src/components/weight-card.tsx:94-95, 102`
- First-time fallback weight **69**; pre-fill from `recentRecords[0].weight`; `if (pendingWeight !== null) return` carry-forward guard — confirmed. `src/components/weight-card.tsx:53-60`
- `InlineEdit` blur pipeline: empty/NaN reverts silently, clamp `Math.max(min, Math.min(max, parsed))`, then `roundOnBlur`; card passes `min={0.1} max={1000}` and rounds to increment then 2dp — confirmed. `src/components/ui/inline-edit.tsx:74-95`; `weight-card.tsx:199-208`
- `InlineEdit` defaults `min = 0`, `max = 100000` — confirmed. `src/components/ui/inline-edit.tsx:41-42`
- `InlineEdit` props on card: `type="text"`, `inputMode="decimal"`, `pattern="[0-9]*[.]?[0-9]*"`, editing underline `border-b-2 border-current` — confirmed. `weight-card.tsx:204-206`; `inline-edit.tsx:115`
- Center display format `v?.toFixed(2) ?? "--"`, suffix "kg" — confirmed. `weight-card.tsx:195`
- `WeightFormSchema`: `.positive("Weight must be positive").max(1000, "Weight seems too high")`, `invalid_type_error: "Weight is required"` — confirmed verbatim. `weight-card.tsx:15-19`
- Submit logs `logAudit("validation_error", ...)` and aborts on failure — confirmed. `weight-card.tsx:116-117`
- Custom time: timestamp passed only when `showTimeInput`, else service defaults to `Date.now()`; on success `setShowTimeInput(false)` + reset `customTime`, weight kept — confirmed. `weight-card.tsx:122-131`; `health-service.ts:19`
- Add success toast: title "Weight recorded", desc `` `${pendingWeight.toFixed(2)} kg logged successfully` ``, variant `success`; error title "Error" — confirmed. `weight-card.tsx:124-138`
- Recent list: `useWeightRecords(5)` fetches 5, `RecentEntriesList` default `maxEntries = 3`, renders `timestamp · XX.XX kg`, returns null when empty — confirmed. `use-health-queries.ts:68`; `recent-entries-list.tsx:105, 110`; `weight-card.tsx:267-274`
- Inline edit: `parseFloat(editWeight)`, reject NaN or `<= 0` with destructive "Invalid weight" toast; in-card weight `<Input type="number" step="0.01">` — confirmed. `weight-card.tsx:78-83, 277`
- `useEditRecord`: invalid date → `dateTimeLocalToTimestamp` throws → catch → "Invalid date/time" destructive toast; success → "Entry updated"; note `editNote.trim() || undefined` — confirmed. `use-edit-record.ts:94-118, 101`
- Delete: `useDeleteWithToast` spinner via `deletingId`, `stopPropagation` on trash, toast "Entry deleted" / "Weight record removed", error "Could not delete the entry" — confirmed. `recent-entries-list.tsx:160-170`; `use-delete-with-toast.ts:21-44`; `weight-card.tsx:48`
- Soft delete sets `deletedAt`+`updatedAt`; queries filter `deletedAt === null`; `undoDeleteWeightRecord` restores `deletedAt: null` — confirmed. `health-service.ts:57-83, 37`
- Loading skeletons: header pulse two bars; stepper two `h-14 w-14` round skeletons, `h-10 w-32` value, `h-11` button — confirmed. `weight-card.tsx:146-174`
- Empty state: `headerRight` is `null`; `RecentEntriesList` returns null — confirmed. `weight-card.tsx:160`; `recent-entries-list.tsx:110`
- `EditWeightDialog`: open when `record !== null`; weight `type="number" min="0.1" step="0.1"` `autoFocus`; title "Edit Weight Entry"; "Save Changes"/"Cancel"; submit button `bg-emerald-600 hover:bg-emerald-700`; `onFocus` prop on inputs — confirmed. `edit-weight-dialog.tsx:43, 54-62, 102`
- `EditWeightDialog` used by history-drawer and analytics records-tab, NOT the dashboard card — confirmed. `history-drawer.tsx:306`; `analytics/records-tab.tsx:468`
- Collapsible toggle text "Set different time" ↔ "Using custom time", label "When was this measured?", chevron up/down, `max = getCurrentDateTimeLocal()`, expanded panel `bg-muted/50 border` — confirmed. `collapsible-time-input.tsx:42-61, 97-117` (doc says `bg-muted/30` for expanded panel — see note below)
- `WeightRecord` interface fields exactly as listed; `weight: number // in kg`; `deletedAt: number | null` — confirmed. `db.ts:68-78`
- Dexie schema version 14, index `"id, timestamp, updatedAt"` — confirmed. `db.ts:467, 719`
- Postgres mirror `weight_records`: `weight: real`, `timestamp/createdAt/updatedAt/deletedAt: bigint`, `userId` fk cascade, index `idx_weight_user_updated` on `(userId, updatedAt)` — confirmed. `db/schema.ts:96-118`
- Weight theme tokens (`CARD_THEMES.weight`): label "Weight", icon `Scale`, sectionId "section-weight", gradient/border/iconBg/iconColor/buttonBg/hoverBg/loadingBg/latestValueColor/progressOverLimit all match digit-for-digit — confirmed. `card-themes.ts:122-142`
- No target/goal weight implemented anywhere (no `targetWeight`/`goalWeight`/`target_weight` symbols) — confirmed by repo-wide grep (zero hits).

## Low-confidence / could-not-verify

- **Recent-row editing panel class:** doc line 64 says the editing row uses `bg-muted/30` and line 66 references hover `hover:bg-black/5 dark:hover:bg-white/5`. Both are confirmed correct in `recent-entries-list.tsx:124` (editing panel `bg-muted/30 rounded-lg p-2 -mx-1.5`) and `:135` (hover/active classes). Not an inaccuracy — flagged only because the doc lists `bg-muted/30` while the collapsible time panel separately uses `bg-muted/50`; both coexist and are correct.
- **"relative" timestamp wording** (line 24) was treated as a low-severity inaccuracy above; if the author meant "human-readable/short" rather than "relative-time", it is merely loose wording, not a behavioral error.
- The `voice-parse` lbs→kg conversion and `manuals.ts` "kilograms or pounds / target weight" text describe functionality outside the weight-card unit; I could not find any settings UI or store value backing the manual's claim, so it appears to be stale help copy rather than evidence the doc is wrong.
