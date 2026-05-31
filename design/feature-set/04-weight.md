# 04 — Weight Card

**Files covered:**
- `src/components/weight-card.tsx` (primary dashboard card)
- `src/components/edit-weight-dialog.tsx` (modal edit form used by history-drawer + analytics records-tab)
- `src/lib/health-service.ts` (Dexie CRUD for weight + blood-pressure records)
- `src/hooks/use-health-queries.ts` (React Query / Dexie live-query hooks)
- `src/components/ui/inline-edit.tsx` (tap-to-type numeric display)
- `src/components/collapsible-time-input.tsx` ("Set different time" control)
- `src/components/recent-entries-list.tsx` (Recent list + inline edit form shell)
- `src/components/card-shell.tsx` (shared themed card chrome)
- `src/hooks/use-edit-record.ts`, `src/hooks/use-delete-with-toast.ts` (shared edit/delete flows)
- `src/lib/card-themes.ts` (weight theme tokens)
- `src/stores/settings-store.ts` (`weightIncrement` config)
- `src/lib/db.ts` / `src/db/schema.ts` (`WeightRecord` / `weight_records`)
- `src/lib/date-utils.ts` (datetime-local conversions)

**Purpose:** A dashboard card for logging body weight in kilograms via a stepper (±) and direct tap-to-type entry, with optional custom timestamp, latest-value header, and an editable/deletable "Recent" history. A separate modal `EditWeightDialog` provides full-form weight editing from the History drawer and Analytics records tab.

---

## Features

- **Latest-weight header stat.** Top-right of the card shows the most recent record's weight formatted `XX.XX kg` plus a relative/formatted timestamp (`formatDateTime`). Hidden when there are no records.
- **Stepper entry.** Minus / Plus circular icon buttons (`h-14 w-14` rounded-full) adjust the pending weight by `settings.weightIncrement` (default **0.05 kg**).
- **Direct keyboard input.** The big center value is an `InlineEdit` — tapping it turns the display into an editable text field (`inputMode="decimal"`, `pattern="[0-9]*[.]?[0-9]*"`) so the user can type an exact value.
- **Rounding on blur.** When direct input loses focus, the typed value is clamped to `[0.1, 1000]` then snapped to the nearest `weightIncrement` multiple and re-rounded to 2 decimals.
- **Pre-fill / carry-forward.** On load, pending weight is seeded from the latest record's weight (`D-03`). With no records, it defaults to **69** (`D-04`, `D-12`). After a successful record, the value is kept as the starting point for the next entry (no reset).
- **Custom time entry.** Collapsible "Set different time" reveals a `datetime-local` input (max = now) so a weigh-in can be backdated; otherwise the record uses `Date.now()`.
- **Record submission.** "Record Weight" button validates, persists to Dexie (offline-first), schedules a sync push, and shows a success toast (`"<value> kg logged successfully"`).
- **Recent history list.** Shows up to 3 of the latest 5 records, each as `timestamp · XX.XX kg`, with per-row delete and tap-to-edit-inline.
- **Inline edit (in-card).** Tapping a Recent row opens an inline form (weight number input + datetime-local + optional note + Save/Cancel) without leaving the card.
- **Inline delete with undo-capable service.** Soft-deletes a record (sets `deletedAt`); service exposes `undoDeleteWeightRecord` (restores `deletedAt: null`).
- **Modal edit dialog (`EditWeightDialog`).** Full dialog with Weight / Time / Note fields used from History drawer and Analytics records tab (not from the dashboard card itself).
- **Offline-first persistence + sync.** All writes go through `writeWithSync(...)` and call `schedulePush()` to mirror to Neon Postgres later.
- **Live reactivity.** `useWeightRecords` is a Dexie `useLiveQuery`, so the header, stepper pre-fill, and Recent list update automatically when data changes (including from sync).

## User actions & interactions

- **Tap Minus (−):** decrements pending weight by `weightIncrement`, re-rounds to 2 decimals, floors at **0.1 kg** (`Math.max(0.1, next)`). Disabled when pending is `null` or `≤ weightIncrement`.
- **Tap Plus (+):** increments pending weight by `weightIncrement`, re-rounds to 2 decimals. Disabled only when pending is `null`.
- **Tap center value:** enters direct-edit mode; the display shows the current value as editable text with an underline (`border-b-2`).
- **Type a value + blur / Enter:** Enter blurs the field; on blur the value is parsed, clamped, rounded to the increment, and committed. Empty or non-numeric input reverts silently (no change, no error).
- **Toggle "Set different time":** expands/collapses the `datetime-local` picker (label "When was this measured?"; button text toggles "Set different time" ↔ "Using custom time", chevron flips).
- **Change custom time:** updates `customTime`; used only when the section is expanded (`showTimeInput`).
- **Tap "Record Weight":** runs Zod validation; on success persists and toasts; resets the time section to collapsed + now, but keeps the weight value. Disabled while the add mutation is pending or pending is `null`.
- **Tap a Recent row:** opens the inline edit form for that record (keyboard: Enter/Space on the focused row also opens it).
- **Inline edit — change weight / time / note, Save:** parses + validates and updates the record (`"Entry updated"` toast); invalid weight → `"Invalid weight"` destructive toast and aborts; invalid date → `"Invalid date/time"` destructive toast.
- **Inline edit — Cancel:** closes the form without saving.
- **Tap Recent row delete (trash icon):** soft-deletes (`stopPropagation` so it doesn't open edit); shows a per-row spinner; toast `"Entry deleted" / "Weight record removed"`; error toast on failure.
- **`EditWeightDialog` actions (modal):** edit Weight/Time/Note, Save Changes (submit) or Cancel/close (Escape or backdrop). `onFocus` handler can select text in inputs.

## States & presentations

- **Loading (Dexie unresolved, `recentRecords === undefined`):** header shows an animated pulse placeholder (two bars). The stepper area shows skeletons: two round `h-14 w-14` skeletons (buttons), a centered `h-10 w-32` value skeleton, and a full-width `h-11` button skeleton. Recent list is not rendered.
- **Default (loaded, has records):** header shows latest `XX.XX kg` + timestamp; stepper shows pre-filled value; Recent list shows up to 3 rows.
- **Empty (loaded, zero records):** header right is `null` (no stat). Pending value defaults to **69**. `RecentEntriesList` renders nothing (returns null when records empty).
- **Direct-edit active:** center display becomes editable text with an underline; suffix `kg` stays visible.
- **Submitting (add pending):** "Record Weight" button shows spinner + "Recording…"; button disabled.
- **Validation error (weight):** red centered message under the stepper (e.g. "Weight is required", "Weight must be positive", "Weight seems too high"); an audit `validation_error` event is logged.
- **Minus disabled:** when value `≤ weightIncrement` (prevents going to/below the increment) or value is `null`.
- **Plus disabled:** only when value is `null`.
- **Custom-time collapsed vs expanded:** collapsed = single ghost toggle button; expanded = bordered muted panel with labeled datetime input.
- **Recent row — editing:** the tapped row is replaced by an inline form on a `bg-muted/30` rounded panel.
- **Recent row — deleting:** that row's trash button shows a spinner and is disabled.
- **Recent row — hover/active (when editable):** subtle background highlight (`hover:bg-black/5` / `dark:hover:bg-white/5`, active deeper).
- **Offline / syncing:** no distinct UI on this card; writes succeed locally and queue a push. Live-query reflects synced changes when they land.
- **Success:** green-tinted toast variant on record; plain toast on edit/delete.
- **Theme variant:** entire card uses the emerald/teal "weight" theme (see enums) in both light and dark mode.
- **`EditWeightDialog` open/closed:** open when `record !== null`; closing via Cancel, backdrop, or Escape calls `onClose`. Weight input is `autoFocus`.

## Enums, options & configurable values

- **Unit:** kilograms only — `kg`. Weight is stored "in kg" (per `WeightRecord` comment). **No lbs/pounds, no imperial/metric toggle exists in code.**
- **`weightIncrement` (stepper step / rounding granularity):** default **0.05** kg. Settable via `setWeightIncrement`, sanitized by `sanitizeNumericInput(value, fallback=0.05, max=1, decimals=2)` → effective range roughly `(0, 1]`, 2-dp.
- **Value display format:** `value.toFixed(2)` → always 2 decimals (e.g. `69.05 kg`); placeholder `--` when null.
- **Decrement floor:** **0.1 kg** (`Math.max(0.1, next)`).
- **Direct-input clamp range:** `min = 0.1`, `max = 1000`.
- **Validation bounds (Zod `WeightFormSchema`):** `weight` must be a number, `.positive()`, `.max(1000)`. Messages: `"Weight is required"` (invalid type), `"Weight must be positive"`, `"Weight seems too high"`.
- **First-time fallback weight:** **69** kg.
- **Recent query limit:** `useWeightRecords(5)` fetches 5; list renders `maxEntries = 3`.
- **`InlineEdit` defaults:** `min = 0`, `max = 100000` (card overrides to 0.1 / 1000).
- **`EditWeightDialog` inputs:** weight `type="number" min="0.1" step="0.1"`; in-card inline weight input `step="0.01"`.
- **Custom-time input:** `type="datetime-local"`, `max = getCurrentDateTimeLocal()` (cannot be in the future). Default value = now.
- **No target/goal weight** is implemented (no target field, store value, or UI).
- **Weight theme tokens (`CARD_THEMES.weight`):**
  - label: `"Weight"`, icon: `Scale` (lucide), sectionId: `"section-weight"`
  - gradient: `from-emerald-50 to-teal-50` / dark `from-emerald-950/40 to-teal-950/40`
  - border: `border-emerald-200 dark:border-emerald-800`
  - iconBg: `bg-emerald-100 dark:bg-emerald-900/50`, iconColor: `text-emerald-600 dark:text-emerald-400`
  - buttonBg: `bg-emerald-600 hover:bg-emerald-700`
  - hoverBg: `hover:bg-emerald-100 hover:border-emerald-300 dark:hover:bg-emerald-900/50`
  - loadingBg: `bg-emerald-200 dark:bg-emerald-800`
  - latestValueColor: `text-emerald-700 dark:text-emerald-300`
  - progressOverLimit: `bg-red-500` (unused here; no progress bar on weight)
- **Toast strings:** add success title `"Weight recorded"` / desc `"<v> kg logged successfully"` (variant `success`); add error `"Error"`; edit success `"Entry updated"`; edit invalid `"Invalid weight"` / `"Invalid date/time"` (destructive); delete `"Entry deleted"` / `"Weight record removed"`.

## Data model touched

**Dexie table `weightRecords`** (`src/lib/db.ts`, schema version 14; indexes `"id, timestamp, updatedAt"`). Interface `WeightRecord`:
- `id: string`
- `weight: number` (kg)
- `timestamp: number` (ms epoch)
- `note?: string`
- `createdAt: number`, `updatedAt: number`, `deletedAt: number | null` (soft delete)
- `deviceId: string`, `timezone: string` (sync/audit fields, set via `syncFields()`)

**Neon Postgres mirror `weight_records`** (`src/db/schema.ts`): `id` (pk), `userId` (fk → usersSync, cascade), `weight: real`, `timestamp: bigint`, `note: text`, `createdAt/updatedAt/deletedAt: bigint`, `deviceId: text`, `timezone: text`; index `idx_weight_user_updated` on `(userId, updatedAt)`.

**Service functions used** (`health-service.ts`): `addWeightRecord(weight, timestamp?, note?)`, `getWeightRecords(limit?)` (filters `deletedAt === null`, newest first), `getLatestWeightRecord()`, `updateWeightRecord(id, {weight?, timestamp?, note?})`, `deleteWeightRecord(id)` (soft), `undoDeleteWeightRecord(id)`, plus pagination/date-range helpers (`getWeightRecordsByDateRange`, `getWeightRecordsPaginated`). All writes go through `writeWithSync("weightRecords", ...)` and `schedulePush()`.

**Hooks** (`use-health-queries.ts`): `useWeightRecords(limit=5)`, `useLatestWeight()`, `useAddWeight()`, `useUpdateWeight()`, `useDeleteWeight()` (mutations unwrap `ServiceResult`).

## Validation, edge cases & business rules

- **Rounding pipeline (stepper):** each ± produces `Math.round((prev ± inc) * 100) / 100` → values held to 2 decimals to avoid float drift.
- **Rounding on direct input blur:** clamp to `[0.1, 1000]`, then `Math.round(v / inc) * inc`, then re-round to 2 decimals. Empty/`NaN` input reverts silently.
- **Decrement guard:** never drops below 0.1; button disabled at `≤ inc` so it can't reach 0.
- **Submit validation:** Zod requires a positive number ≤ 1000; failures set `fieldErrors.weight`, render a red message, log an audit event, and abort the save.
- **Null pending guard:** all of decrement, increment, submit no-op when pending is `null` (during the brief load window).
- **Custom time only when expanded:** `timestamp` passed only if `showTimeInput` is true; otherwise service defaults to `Date.now()`.
- **Timestamp conversion:** `dateTimeLocalToTimestamp` throws on invalid input (never returns NaN); callers catch and toast. Conversions are local-timezone aware (offset-adjusted ISO slice to/from `datetime-local`).
- **Inline-edit weight check:** `parseFloat(editWeight)`; reject `NaN` or `≤ 0` with `"Invalid weight"`.
- **Note handling:** trimmed; empty/whitespace note is dropped (not stored) on add; on edit, blank note becomes `undefined`.
- **Soft delete:** delete sets `deletedAt`/`updatedAt`; queries exclude soft-deleted; restore path exists in service.
- **Carry-forward, not reset:** after recording, pending value persists; `useEffect` won't overwrite a non-null pending (`D-14`), so a manual edit isn't clobbered by the latest-record effect.
- **No future timestamps** for custom time (input `max` = now).

## Sub-components / variants

- `WeightCard` — the dashboard weight card (stepper + direct input + custom time + Recent list).
- `EditWeightDialog` — modal weight edit form (Weight/Time/Note); used by History drawer & Analytics records-tab, not the dashboard card.
- `InlineEdit` — tap-to-type numeric display with clamp + round-on-blur; powers the center value.
- `CollapsibleTimeInputControlled` — parent-controlled "Set different time" datetime panel (variant of `CollapsibleTimeInput`).
- `RecentEntriesList` — shared Recent section (rows, delete buttons, click-to-edit), `maxEntries=3`.
- `InlineEditFormShell` — shared inline edit form wrapper (children + timestamp + note + Save/Cancel).
- `CardShell` — themed card chrome (gradient, icon, label, header-right slot).
- `useEditRecord` — generic open/populate/submit edit flow (timestamp/note + buildUpdates).
- `useDeleteWithToast` — delete-with-spinner + toast flow (`deletingId`, `handleDelete`).
- `useWeightRecords` / `useAddWeight` / `useUpdateWeight` / `useDeleteWeight` — data hooks.
