# 03 — Blood Pressure Card

**Files covered:**
- `src/components/blood-pressure-card.tsx` — the main dashboard card (entry form + recent list + inline edit)
- `src/components/edit-blood-pressure-dialog.tsx` — standalone modal edit dialog (used by History drawer + Analytics Records tab, NOT by the card itself)
- `src/lib/health-service.ts` — CRUD service against Dexie (BP section, lines 101–238)
- `src/hooks/use-health-queries.ts` — React-Query / Dexie-live-query hooks
- `src/lib/constants.ts` — `getBPCategory()` classifier + `BPCategory` type
- `src/lib/card-themes.ts` — `CARD_THEMES.bp` visual theme tokens
- `src/components/recent-entries-list.tsx` — shared "Recent" list + `InlineEditFormShell`
- `src/components/collapsible-time-input.tsx` — `CollapsibleTimeInputControlled` (custom-time override)
- `src/hooks/use-edit-record.ts`, `src/hooks/use-delete-with-toast.ts` — shared edit/delete behaviors
- `src/lib/db.ts` (lines 80–95, table defs) — `BloodPressureRecord` interface + Dexie schema
- `src/db/schema.ts` (lines 120–149) — Neon Postgres mirror table
- `src/components/page-skeletons.tsx` (lines 103–126) — route-level loading skeleton

**Purpose:** A self-contained dashboard card to record a blood-pressure reading (systolic / diastolic, optional heart rate, position, arm, irregular-heartbeat flag, optional custom time), classify it by hypertension grade with risk-coloring, derive pulse pressure, and review / edit / delete the most recent readings inline.

---

## Features

- **Header summary of latest reading.** Shows the most recent reading (`recentRecords[0]`) at top-right:
  - Reading as `systolic/diastolic` plus unit label `mmHg`.
  - BP category label (e.g. "Optimal", "Grade 1 hypertension") in its risk color, from `getBPCategory(systolic, diastolic)`.
  - Heart rate as `{n} BPM` (only when present).
  - **Pulse pressure**: computed as `systolic − diastolic`, shown as `Pulse pressure {n} mmHg`. The numeric value is red when `pp > 60` (elevated) or `pp < 30` (narrow), otherwise muted.
- **Systolic / diastolic entry** — two always-visible numeric inputs (top/bottom), side by side.
- **Heart-rate entry (optional)** — numeric input promoted into the primary area, with a fixed `BPM` suffix chip.
- **"More options" expander** revealing three segmented toggles + a custom-time control:
  - **Position** toggle: Sitting / Standing.
  - **Arm** toggle: Left / Right.
  - **Irregular Heartbeat** toggle: No / Yes (Yes shows a red-tinted active state).
  - **Time override** via `CollapsibleTimeInputControlled` ("Set different time" → datetime-local).
- **Record Reading** primary action — validates, persists, toasts, resets form.
- **BP category classification** (ESH 2023 / 2018 ESC-ESH office scale; same scale Withings BPM devices use in Europe), evaluated highest-first, OR-based across systolic/diastolic.
- **Pulse-pressure derivation & coloring** (header only).
- **Recent readings list** — up to 3 most recent (card fetches 5, list slices to 3), each row showing time, then `{position} · {arm} arm` (the literal word "arm" is appended after the arm value, e.g. "sitting · left arm") · optional `{hr} BPM` · optional "irregular", the reading, and its `(category)` label in risk color.
- **Inline edit** — tapping a recent row swaps it for an inline edit form (systolic, diastolic, heart rate, position select, arm select, irregular-heartbeat checkbox, time, note).
- **Delete** with per-row spinner + toast.
- **Offline-first persistence** — writes go straight to IndexedDB (Dexie) and queue a background sync push; no network needed to record.
- **Loading skeleton (dead code).** The card contains a header `isLoading ? (...)` branch that would render an `animate-pulse` placeholder, but `useBloodPressureRecords` passes `[]` as the `useLiveQuery` default result, so the hook returns `[]` (never `undefined`) before the query resolves. `isLoading = !recentRecords` is therefore always `false` (`![] === false`) and the header skeleton branch **never renders**. Only the route-level `BloodPressureCardSkel` skeleton is actually shown during page load.
- `EditBloodPressureDialog` (separate file) provides a similar edit surface as a modal, consumed by History drawer and Analytics "Records" tab. **Note:** neither real consumer passes `onIrregularHeartbeatChange`, and the dialog only renders its "Irregular Heartbeat" Select when that handler is supplied — so in production the modal edit flow has **no irregular-heartbeat control** (it edits systolic, diastolic, heart rate, position, arm, time, and note only).

---

## User actions & interactions

- **Type systolic / diastolic / heart rate** — controlled numeric inputs; values held as strings until submit.
- **Tap "More options"** — toggles the details panel open/closed (chevron up/down).
- **Tap Position Sitting/Standing** — sets `position`; active button gets `theme.activeToggle` (rose tint).
- **Tap Arm Left/Right** — sets `arm`; active button highlighted.
- **Tap Irregular Heartbeat No/Yes** — sets boolean; "Yes" active state is red-tinted (`bg-red-100 border-red-300 dark:bg-red-900/50 dark:border-red-700`) rather than the rose theme tint.
- **Tap "Set different time"** — expands a `datetime-local` input (max = now); only applied to the new record if expanded at submit time.
- **Tap "Record Reading"** — runs Zod validation; on success persists and toasts success, then resets systolic/diastolic/heartRate inputs, `irregularHeartbeat→false`, collapses details, collapses time, resets custom time to now. Button is disabled while pending or while systolic OR diastolic is empty.
- **Tap a recent entry row** — opens inline edit for that record (`openEdit`); row also keyboard-activatable via Enter/Space (role="button", tabIndex 0).
- **In inline edit form:** edit systolic/diastolic/heart-rate inputs; change Position select (items "Sitting"/"Standing"); change Arm select (items labeled **"Left arm"/"Right arm"** here — differing from the modal dialog's plain "Left"/"Right"); toggle "Irregular heartbeat" checkbox; change date/time; edit note; **Save** (persists, toast "Entry updated", closes) or **Cancel** (`closeEdit`, discards).
- **Tap the trash icon on a row** — deletes (soft-delete); shows row spinner; toast "Entry deleted" / "Blood pressure record removed". `stopPropagation` prevents opening edit.
- **In `EditBloodPressureDialog` (modal variant):** fields rendered as a Dialog with Cancel / Save Changes footer (no irregular-heartbeat control in production — see note above); closes on backdrop / Escape via `onOpenChange`; systolic auto-focused. Both real consumers pass `scrollOnFocus` as the shared `onFocus` handler (a scroll-into-view-on-focus behavior, not a select-all).

---

## States & presentations

- **Loading (header skeleton — dead code):** the card has an `isLoading ? (...)` branch that would render an `animate-pulse` placeholder (rose `loadingBg` bar + muted bar), but because `useBloodPressureRecords` defaults the live query to `[]` (never `undefined`), `isLoading` is always `false` and this branch never renders. The actual load state shown is the route-level skeleton `BloodPressureCardSkel`, which mirrors the layout (two h-12 input blocks, BPM row, expander bar, record button).
- **Empty (no readings):** header right side renders nothing (no latest reading, no category). Recent list returns `null` (hidden entirely) when `records` is empty.
- **Default / populated:** header shows latest reading + category + optional BPM + pulse pressure; entry form shown; recent list shows up to 3 rows.
- **Details collapsed (default):** only systolic/diastolic/heart-rate + "More options" + Record button visible.
- **Details expanded:** position/arm/irregular toggles + time override revealed inside a `bg-muted/50` bordered panel.
- **Active/selected toggles:** selected Position/Arm/No-irregular use rose `activeToggle` tint; selected Irregular=Yes uses red tint.
- **Validation-error:** per-field error text in `text-destructive` beneath the offending input (systolic / diastolic / heartRate). Logged via `logAudit("validation_error", …)`.
- **Submitting (pending):** Record button shows spinner + "Recording…"; button disabled.
- **Success:** toast (variant `success`) "Blood pressure recorded" / "{sys}/{dia} mmHg logged successfully"; form resets.
- **Error (persist failure):** destructive toast "Error" with the error message.
- **Row editing:** the row is replaced in place by the inline edit form on a `bg-muted/30` rounded background.
- **Row deleting:** trash icon becomes a spinner; button disabled for that row.
- **Row hover/active:** clickable rows get `hover:bg-black/5 dark:hover:bg-white/5` / `active:bg-black/10`.
- **Pulse-pressure abnormal:** value text turns red (`text-red-500 dark:text-red-400`) when `>60` or `<30`; otherwise `text-muted-foreground`.
- **Category risk coloring:** label color varies by grade (green → lime → yellow → orange → red-600 → red-700) — see enum below.
- **Disabled Record button:** when `addMutation.isPending` OR systolic empty OR diastolic empty.
- **Offline/syncing:** no dedicated visual on this card; writes succeed locally and `schedulePush()` queues sync transparently.
- **Modal dialog (`EditBloodPressureDialog`) open state:** `open` driven by `record !== null`; irregular-heartbeat row only rendered when `onIrregularHeartbeatChange` handler is supplied — and since neither real consumer (History drawer, Analytics Records tab) passes that handler, the row is **never rendered in production**.

---

## Enums, options & configurable values

**Position** (`"standing" | "sitting"`): options `Sitting`, `Standing`. Default in card form: `"sitting"`.

**Arm** (`"left" | "right"`): options `Left`, `Right`. Default in card form: `"left"`.

**Irregular heartbeat** (`boolean`, optional): toggle No / Yes (modal uses a "no"/"yes" Select). Default: `false`.

**Unit labels:** `mmHg` (pressure), `BPM` (heart rate).

**BP category thresholds** (`getBPCategory`, highest-first, OR across sys/dia):

| Condition (sys OR dia) | Label | Color (light / dark) |
|---|---|---|
| `sys ≥ 180` or `dia ≥ 110` | Grade 3 hypertension | `text-red-700 / dark:text-red-300` |
| `sys ≥ 160` or `dia ≥ 100` | Grade 2 hypertension | `text-red-600 / dark:text-red-400` |
| `sys ≥ 140` or `dia ≥ 90` | Grade 1 hypertension | `text-orange-600 / dark:text-orange-400` |
| `sys ≥ 130` or `dia ≥ 85` | High normal | `text-yellow-600 / dark:text-yellow-400` |
| `sys ≥ 120` or `dia ≥ 80` | Normal | `text-lime-600 / dark:text-lime-400` |
| else | Optimal | `text-green-600 / dark:text-green-400` |

**Pulse-pressure thresholds:** normal ≈ 40 mmHg; `> 60` elevated, `< 30` narrow → both render red (`text-red-500 dark:text-red-400`), else muted (`text-muted-foreground`).

**Validation ranges** (`BloodPressureFormSchema`, card add):
- Systolic: integer, min 50, max 300, required ("Systolic is required").
- Diastolic: integer, min 20, max 200, required ("Diastolic is required").
- Heart rate: integer, min 20, max 250, optional.

**Input `min`/`max` HTML attrs differ from Zod** (and across surfaces — a designer must pick one set):
- Card add inputs: systolic min 0 / max 300; diastolic min 0 / max 200; heart rate min 0 / max 250.
- `EditBloodPressureDialog`: systolic min 60 / max 300; diastolic min 40 / max 200; heart rate min 30 / max 250.
- Inline edit (card) uses no min/max attrs; validates only `> 0` and not-NaN, sys & dia required, heart rate optional.

**Placeholders:** systolic `120`, diastolic `80`, heart rate `72` (card) / `BPM` (dialog).

**Field labels:** "Systolic (top)", "Diastolic (bottom)", "Heart Rate (optional)" (card); "Systolic", "Diastolic", "Heart Rate (optional)" (dialog). SR-only hints in dialog cite typical ranges: systolic 90–180, diastolic 60–120, heart rate 60–100.

**Recent list size:** card fetches limit `5` (`useBloodPressureRecords(5)`); list renders `maxEntries` default `3`.

**Theme (`CARD_THEMES.bp`):** label "Blood Pressure", icon `Heart` (lucide), gradient `from-rose-50 to-pink-50 dark:from-rose-950/40 dark:to-pink-950/40`, border `border-rose-200 dark:border-rose-800`, iconBg/iconColor rose, button `bg-rose-600 hover:bg-rose-700`, activeToggle `bg-rose-100 border-rose-300 dark:…`, sectionId `section-bp`. Dialog Save button hardcodes `bg-rose-600 hover:bg-rose-700`.

---

## Data model touched

**Dexie table `bloodPressureRecords`** — interface `BloodPressureRecord` (`src/lib/db.ts:80`):
- `id: string` (generated via `generateId()`)
- `systolic: number` (top, mmHg)
- `diastolic: number` (bottom, mmHg)
- `heartRate?: number` (BPM, optional)
- `irregularHeartbeat?: boolean` (optional flag)
- `position: "standing" | "sitting"`
- `arm: "left" | "right"`
- `timestamp: number` (epoch ms; defaults to `Date.now()`)
- `note?: string`
- sync/meta: `createdAt`, `updatedAt`, `deletedAt: number | null`, `deviceId`, `timezone` (added by `syncFields()`).

**Dexie index:** `"id, timestamp, position, arm, updatedAt"` (repeated identically across schema versions 10–14, as Dexie requires the full schema each version). The `backfill` and `backfillTimezone` migrations also touch `bloodPressureRecords` (populating sync/timezone fields on existing rows).

**Postgres mirror `blood_pressure_records`** (`src/db/schema.ts:120`) — field-for-field parity, with DB CHECK constraints: `position IN ('standing','sitting')`, `arm IN ('left','right')`; `user_id` FK to `usersSync.id` (`onDelete: cascade`). Two indexes: `idx_bp_user_updated` on `(userId, updatedAt)` and `idx_bp_ts` on `timestamp`.

**Service functions (`health-service.ts`):** `addBloodPressureRecord`, `getBloodPressureRecords(limit?)`, `getBloodPressureRecordsByDateRange` (the only BP read that uses the `timestamp` index — a Dexie `.where("timestamp").between(start, end)` query; the other reads full-scan via `orderBy("timestamp")` + in-memory filter), `getLatestBloodPressureRecord`, `deleteBloodPressureRecord` (soft), `undoDeleteBloodPressureRecord`, `updateBloodPressureRecord`, `getBloodPressureRecordsPaginated`. The write functions use `writeWithSync(...)` + `schedulePush()`; reads filter `deletedAt === null`.

**Hooks (`use-health-queries.ts`):** `useBloodPressureRecords(limit=5)` (live query, default `[]`), `useLatestBloodPressure()`, `useAddBloodPressure`, `useUpdateBloodPressure`, `useDeleteBloodPressure`. Param types `AddBloodPressureParams` / `UpdateBloodPressureParams`.

---

## Validation, edge cases & business rules

- **Add path validation** is Zod (`BloodPressureFormSchema`): integers only, systolic 50–300, diastolic 20–200, heart rate (if given) 20–250; both pressures required. On failure, per-field errors set + audit log; no submit.
- **Heart rate is conditionally included** — only written when parsed and not NaN; spread conditionally so an empty field is omitted entirely (not stored as 0/null).
- **Irregular heartbeat: "only when true" is a caller constraint, not the service.** The `addBloodPressureRecord` service writes `irregularHeartbeat` whenever it is `!== undefined` (`...(irregularHeartbeat !== undefined && { irregularHeartbeat })`), so passing `false` *would* persist `false`. The card add path, however, only ever passes `true` (it spreads `irregularHeartbeat && { irregularHeartbeat: true }`), so in practice the field is **absent-or-`true`**. On update it's written through directly. A record may therefore have the field absent vs. `false`.
- **Inline-edit validation** is looser than add: rejects only NaN or `≤ 0` for sys/dia (and heart rate if provided), via toast "Invalid values" → returns `null` to abort. No min/max enforcement.
- **Timestamp default:** `timestamp ?? Date.now()`. Custom time only applied when the time override is expanded at submit (`showTimeInput`). `dateTimeLocalToTimestamp` throws on invalid input (never NaN) — caught in edit to toast "Invalid date/time".
- **Category is OR-based & highest-first:** a normal systolic does NOT cancel a high diastolic (e.g. 118/92 → Grade 1 hypertension).
- **Pulse pressure** = `sys − dia`; can be negative if inputs inverted (no guard) — would still color red via `< 30`.
- **Soft delete:** sets `deletedAt`/`updatedAt`; reads filter `deletedAt === null`. Undo restores by nulling `deletedAt`.
- **Ordering:** records sorted by `timestamp` descending; "latest" = first active.
- **Note trimming:** empty/whitespace notes dropped (not stored).
- **Record button disabled** if systolic OR diastolic input empty (string-empty check, before parse).
- **Per-instance DOM ids** in inline edit shell via `useId()` to avoid collisions when multiple cards mount.

---

## Sub-components / variants

- **`BloodPressureCard`** — the dashboard card: latest-reading header, entry form, expandable details, recent list, inline edit. (`blood-pressure-card.tsx`)
- **`EditBloodPressureDialog`** — fully-controlled modal edit form variant (sys/dia/HR inputs, Position & Arm Selects, datetime-local, note). It also defines an optional Irregular Heartbeat Select, but that row is gated behind an `onIrregularHeartbeatChange` prop that **neither real consumer passes**, so it does not appear in the live History drawer / Analytics Records tab flows. (`edit-blood-pressure-dialog.tsx`)
- **`RecentEntriesList`** — shared "Recent" section: clickable rows, per-row delete with spinner, swaps in inline edit form for the editing row. (`recent-entries-list.tsx`)
- **`InlineEditFormShell`** — wraps domain edit fields with timestamp + note inputs and Save/Cancel. (`recent-entries-list.tsx`)
- **`CollapsibleTimeInputControlled`** — parent-controlled "Set different time" → datetime-local (max = now). (`collapsible-time-input.tsx`)
- **`useEditRecord<BloodPressureRecord>`** — manages editingRecord/timestamp/note + open/close/submit lifecycle. (`use-edit-record.ts`)
- **`useDeleteWithToast`** — deletingId tracking + delete toast. (`use-delete-with-toast.ts`)
- **`getBPCategory` / `BPCategory`** — risk classifier returning `{ label, color }`. (`constants.ts`)
- **`CARD_THEMES.bp`** — rose/pink theme tokens + Heart icon. (`card-themes.ts`)
- **`BloodPressureCardSkel`** — route-level loading skeleton. (`page-skeletons.tsx`)
- Local helpers in card: `formatBPReading(record)` → `"{sys}/{dia}"`; `pulsePressureColor(pp)` → red/muted class.
