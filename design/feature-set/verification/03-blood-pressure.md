# Verification — 03-blood-pressure

**Verdict:** minor-gaps  ·  checked 92 claims, verified 86.

Scope: read every "Files covered" source in full (`blood-pressure-card.tsx`, `edit-blood-pressure-dialog.tsx`, `health-service.ts` BP section, `use-health-queries.ts`, `constants.ts` `getBPCategory`, `card-themes.ts`, `recent-entries-list.tsx`, `collapsible-time-input.tsx`, `use-edit-record.ts`, `use-delete-with-toast.ts`, `db.ts` interface + all Dexie schema lines, `db/schema.ts` Postgres mirror, `page-skeletons.tsx`), plus the two real consumers of the dialog (`history-drawer.tsx`, `analytics/records-tab.tsx`), `date-utils.ts`, `audit.ts`, and the `dexie-react-hooks` `useLiveQuery` type signature. Thresholds/labels/colors checked digit-for-digit.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "Loading skeleton in header while the live query is undefined" / "when `recentRecords` is undefined, the latest-reading block renders an `animate-pulse` placeholder" (lines 42, 65). Implies the header skeleton actually appears during load. | `useBloodPressureRecords` passes `[]` as the `useLiveQuery` **defaultResult**, so the hook returns `[]` (never `undefined`) before the query resolves. The card computes `isLoading = !recentRecords` → `![] === false` always. The header skeleton branch (the `isLoading ? (...)` block) is effectively **dead code that never renders**. | hook: `use-health-queries.ts:118-120`; card: `blood-pressure-card.tsx:64-65,200-204`; signature: `dexie-react-hooks/dist/useLiveQuery.d.ts:2` |
| low | Recent row shows "position · arm · optional BPM · optional 'irregular'" (line 38). | Rendered text appends the literal word "arm" after the arm value: `{position} · {arm} arm` then `· {hr} BPM` then `· irregular` → e.g. "sitting · left arm · 72 BPM · irregular". Doc drops the "arm" suffix word. Cosmetic. | `blood-pressure-card.tsx:447-449` |
| low | Pulse-pressure abnormal value "turns red" / "render red" (lines 27, 78, 107). | Exact classes are `text-red-500 dark:text-red-400` (not red-600/700); muted is `text-muted-foreground`. Doc says "red" generically — fine, but it never states the specific shade, and the threshold helper comment in code also confirms `>60` / `<30`. Confirmed correct behaviorally; flagged only because doc gives precise shades elsewhere but not here. | `blood-pressure-card.tsx:14-19` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| medium | Doc never states that **no real consumer of `EditBloodPressureDialog` passes `onIrregularHeartbeatChange`**, so the dialog's "Irregular Heartbeat" Select row is **never actually rendered** in production. Both `history-drawer.tsx` and `analytics/records-tab.tsx` omit the `irregularHeartbeat` / `onIrregularHeartbeatChange` props. Doc line 82 correctly notes the conditional, and line 173/92 list the Select as a dialog field, but the reader is left believing it appears in the History/Analytics edit flows. | dialog gate: `edit-blood-pressure-dialog.tsx:163`; consumers (no handler): `history-drawer.tsx:318-337`, `analytics/records-tab.tsx:480-499` |
| low | Inline edit Arm `<SelectItem>` labels are "Left arm" / "Right arm" (not "Left"/"Right"); Position items are "Sitting"/"Standing". The dialog (modal) Arm items are "Left"/"Right". Doc describes "Arm select" generically without the differing item labels across surfaces. | inline: `blood-pressure-card.tsx:481-482`; dialog: `edit-blood-pressure-dialog.tsx:154-155` |
| low | `getBloodPressureRecordsByDateRange(start,end)` uses a Dexie `.where("timestamp").between(...)` index query (the only BP read that uses the index rather than full-scan + filter). Doc lists the function but doesn't note the index-backed range behavior. | `health-service.ts:145-154` |
| low | `addBloodPressureRecord` writes `irregularHeartbeat` whenever it is `!== undefined` (so passing `false` would persist `false`). The card add path only ever passes `true` (spreads `irregularHeartbeat && {…true}`), so in practice the field is absent-or-true — matching doc line 157. The service itself, however, is not "only when true"; that constraint lives in the caller. Doc conflates the two. | service: `health-service.ts:120`; card caller: `blood-pressure-card.tsx:159` |
| low | Dexie schema string `"id, timestamp, position, arm, updatedAt"` is repeated across versions 10-14 (lines 468, 736, 763, 791, 820, 850, 880 of `db.ts`); also `backfill`/`backfillTimezone` migrations touch `bloodPressureRecords`. Doc cites the index once (accurate) but not the migration backfills. | `db.ts:540, 606` |
| low | Postgres mirror adds two indexes the doc doesn't mention: `idx_bp_user_updated` on `(userId, updatedAt)` and `idx_bp_ts` on `timestamp`. Doc covers the CHECK constraints and FK but not the indexes. | `db/schema.ts:150-151` |

## Spot-confirmed

- **BP category thresholds, labels, and light/dark colors** — all six bands match digit-for-digit and color-for-color (≥180/≥110 Grade 3 `red-700/red-300`; ≥160/≥100 Grade 2 `red-600/red-400`; ≥140/≥90 Grade 1 `orange-600/orange-400`; ≥130/≥85 High normal `yellow-600/yellow-400`; ≥120/≥80 Normal `lime-600/lime-400`; else Optimal `green-600/green-400`), OR-based, highest-first. `constants.ts:57-71`
- **Zod add validation** — systolic int 50–300 ("Systolic is required" via `invalid_type_error`), diastolic int 20–200, heartRate int 20–250 optional. `blood-pressure-card.tsx:21-27`
- **HTML min/max divergence** — card add: sys 0/300, dia 0/200, hr 0/250 (`:239,255,275`); dialog: sys 60/300, dia 40/200, hr 30/250 (`edit-blood-pressure-dialog.tsx:83,84,99,103,119,120`); inline edit: no min/max attrs, validates only NaN/≤0 (`:100-110, :466-469`). All three sets confirmed.
- **Placeholders** systolic `120`, diastolic `80`, heart rate `72` (card) / `BPM` (dialog). `:240,257,277`; dialog `:124`
- **Field labels** "Systolic (top)", "Diastolic (bottom)", "Heart Rate (optional)" (card `:234,250,269`); "Systolic"/"Diastolic"/"Heart Rate (optional)" (dialog `:79,97,115`); SR-only ranges 90–180 / 60–120 / 60–100 (dialog `:93,111,128`).
- **Defaults** card form `position="sitting"`, `arm="left"`, `irregularHeartbeat=false`. `:57-59`
- **Pulse pressure** = `systolic - diastolic`, no negative guard; red when `>60 || <30`. `:14-19,184-186`
- **Submit reset behavior** clears sys/dia/hr inputs, `irregularHeartbeat→false`, collapses details + time, resets customTime to now. Button disabled when `isPending || !systolicInput || !diastolicInput`. `:167-173, :415`
- **Success / error toasts** "Blood pressure recorded" + "{sys}/{dia} mmHg logged successfully" variant `success`; error "Error" + message variant `destructive`. `:162-180`
- **Delete toast** "Entry deleted" / "Blood pressure record removed", per-row spinner, `stopPropagation`. `use-delete-with-toast.ts:26-29`; `recent-entries-list.tsx:160-170`; card `:69`
- **Edit toast** "Entry updated" on save; "Invalid date/time" on bad timestamp (caught from `dateTimeLocalToTimestamp` throw); "Invalid values" inline-edit abort. `use-edit-record.ts:97,111`; card `:101,108`
- **Irregular toggle red active state** `bg-red-100 border-red-300 dark:bg-red-900/50 dark:border-red-700`; No/Position/Arm active use `theme.activeToggle` rose tint. `:392, 318-394`; theme `card-themes.ts:161`
- **Theme `CARD_THEMES.bp`** label "Blood Pressure", icon `Heart`, gradient `from-rose-50 to-pink-50 dark:from-rose-950/40 dark:to-pink-950/40`, border `border-rose-200 dark:border-rose-800`, button `bg-rose-600 hover:bg-rose-700`, sectionId `section-bp`, loadingBg `bg-rose-200 dark:bg-rose-800`. Dialog Save hardcodes `bg-rose-600 hover:bg-rose-700`. `card-themes.ts:143-163`; dialog `:214`
- **Recent list sizing** card fetches `useBloodPressureRecords(5)`; `RecentEntriesList` slices to `maxEntries=3`; returns `null` when empty. `:64, 433`; `recent-entries-list.tsx:105,110,112`
- **Row keyboard activation** `role="button"`, `tabIndex 0`, Enter/Space via `onKeyDown`. `recent-entries-list.tsx:138-150`
- **`BloodPressureRecord` interface** id/systolic/diastolic/heartRate?/irregularHeartbeat?/position/arm/timestamp/note? + sync fields; Dexie index `"id, timestamp, position, arm, updatedAt"`. `db.ts:80-95, 468`
- **Postgres mirror** `blood_pressure_records` field-for-field, CHECK `position IN ('standing','sitting')` / `arm IN ('left','right')`, `user_id` FK → `usersSync.id` cascade. `db/schema.ts:120-153`
- **Service functions** all eight named functions exist and use `writeWithSync(...)` + `schedulePush()`; reads filter `deletedAt === null`; soft delete sets `deletedAt`+`updatedAt`; undo nulls `deletedAt`. `health-service.ts:103-238`
- **Hooks** `useBloodPressureRecords(limit=5)`, `useLatestBloodPressure`, `useAddBloodPressure`, `useUpdateBloodPressure`, `useDeleteBloodPressure`; param types `AddBloodPressureParams`/`UpdateBloodPressureParams`. `use-health-queries.ts:36-59,118-168`
- **`BloodPressureCardSkel`** route skeleton: two `h-12` input blocks, BPM row (`h-11 flex-1` + `h-11 w-14`), expander bar (`h-8`), record button (`h-10`). `page-skeletons.tsx:103-126`
- **Dialog open driver** `open={record !== null}`, closes via `onOpenChange`, systolic `autoFocus`, shared `onFocus` handler. `edit-blood-pressure-dialog.tsx:70,88`
- **Per-instance DOM ids** in `InlineEditFormShell` via `useId()`. `recent-entries-list.tsx:43-45`
- **Note trimming** empty/whitespace note dropped on add. `health-service.ts:114,124`
- **Validation audit** `logAudit("validation_error", JSON.stringify({...}).slice(0,100))`. `blood-pressure-card.tsx:149`; `audit.ts:27`

## Low-confidence / could-not-verify

- The doc's framing "(ESH 2023 / 2018 ESC-ESH office scale; same scale Withings BPM devices use in Europe)" (lines 36, 51-52) restates a code comment verbatim (`constants.ts:50-56`); the medical-standard provenance itself was not independently verified against any spec — only that the comment and thresholds are internally consistent.
- "Focus handler can select-all on focus" (doc line 59) — `EditBloodPressureDialog` accepts an `onFocus` prop and both consumers pass `scrollOnFocus` (a scroll-into-view handler), not a select-all handler. No select-all behavior was found wired up; the doc's "can select-all" is speculative and unsupported by the two real consumers (`history-drawer.tsx:336`, `analytics/records-tab.tsx:478,498`). Flagged as low-confidence rather than a hard inaccuracy since the prop is generic.
