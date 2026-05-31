# 06 — Defecation Card

**Files covered:**
- `src/components/defecation-card.tsx` (primary dashboard card)
- `src/components/edit-defecation-dialog.tsx` (standalone edit dialog, used by history/analytics, not by the card itself)
- `src/hooks/use-defecation-queries.ts` (React Query + Dexie live-query hooks)
- `src/lib/defecation-service.ts` (CRUD service against Dexie)
- `src/lib/constants.ts` (`DEFECATION_AMOUNT_OPTIONS`)
- `src/lib/card-themes.ts` (`CARD_THEMES.defecation`)
- `src/lib/db.ts` (`DefecationRecord` interface, `defecationRecords` table)
- `src/components/card-shell.tsx`, `src/components/recent-entries-list.tsx`, `src/components/edit-estimate-entry-dialog.tsx` (shared shells)
- `src/hooks/use-edit-record.ts`, `src/hooks/use-delete-with-toast.ts`, `src/hooks/use-undo-delete-mutation.ts` (shared interaction hooks)
- `src/lib/date-utils.ts` (time formatting/parsing)
- `src/stores/settings-store.ts` (`defecationDefaultAmount`)

**Purpose:** A dashboard health card that lets the single user quick-log a bowel movement in one tap (with an optional size estimate), or expand a details panel to set an estimate, a free-text note, and a backdated time. It also shows the most recent entries inline with tap-to-edit and delete.

---

## Features

- **One-tap quick-log** of a defecation event via a 3-button grid (Small / Medium / Large). Each tap immediately creates a record stamped with `Date.now()` and the chosen `amountEstimate`. No confirmation step.
- **"Add details" expandable panel** (collapsed by default) for a richer entry: optional amount estimate (incl. "No estimate"), optional free-text note, and an editable "When" datetime (defaults to now, capped at now). Submit button: "Record with details".
- **Settings-driven default amount**: the details-panel amount Select is pre-seeded from `settings.defecationDefaultAmount` (one of small/medium/large; store default is `"medium"`). After a successful details submit the field resets back to that default.
- **Header "latest timestamp" readout**: when at least one record exists, the card header right-side shows the formatted timestamp of the most recent record (e.g. "Jan 15, 2:30 PM"). Shows a pulsing skeleton while loading; nothing if there are no records.
- **Recent entries list** (most recent 5 fetched, top 3 displayed) showing each record's timestamp, capitalized amount estimate (if present), and truncated note (if present).
- **Inline edit** of any recent entry: tapping a row swaps it for an inline form (amount Select + datetime + note + Save/Cancel) without leaving the card.
- **Delete with undo**: a trash icon per row soft-deletes the record and raises a 5-second "Record deleted" toast with an "Undo" action that restores it.
- **Toast feedback** on every mutation: success toast on quick-log ("Defecation (small) recorded") and details submit ("Defecation recorded"); error toast on failure ("Failed to record"); "Entry updated" / error on edit; "Entry deleted" / error on delete.
- **Offline-first**: all reads/writes go to IndexedDB (Dexie) and are queued for background sync to Neon Postgres; the card works fully offline.
- **Live updates**: list re-renders automatically via `useLiveQuery` when the underlying table changes (e.g. an edit elsewhere, or a sync pull).
- **Standalone edit dialog** (`EditDefecationDialog`) reused by the History drawer and the Analytics records tab for editing defecation records outside the dashboard card.

---

## User actions & interactions

- **Tap a quick-log button (Small / Medium / Large)** → creates a record now with that `amountEstimate`; that button shows a spinner and all three buttons disable until the write resolves; success/error toast follows.
- **Tap "Add details"** (ghost button with chevron) → toggles the details panel open/closed; chevron flips up/down.
- **Select an amount in the details panel** → sets the amount; options are "No estimate" (`__none__`), Small, Medium, Large.
- **Type a note in the details panel** → free-text textarea (placeholder "e.g. consistency, urgency").
- **Change the "When" datetime** → `datetime-local` input, `max` clamped to now.
- **Tap "Record with details"** → parses the datetime, builds the record (omits amount when `__none__`/empty, omits note when blank), creates it; button shows a spinner while pending; on success the panel collapses and all fields reset (amount → settings default, note → empty, time → now).
- **Tap a recent-entry row** → opens the inline edit form for that record (also keyboard-activatable: Enter/Space when the row is focused).
- **In the inline edit form**: change amount Select, datetime, and note; **Save** submits the update (invalid datetime → "Invalid date/time" toast, abort); **Cancel** discards and closes the form.
- **Tap the trash icon on a row** → soft-deletes (row shows spinner while deleting; click is `stopPropagation`'d so it doesn't open edit); raises an undo toast.
- **Tap "Undo" in the delete toast** (within 5s) → restores the soft-deleted record.
- **In the standalone `EditDefecationDialog`** (History/Analytics): edit Time, Amount (with "No estimate"), Note; Save Changes / Cancel; closes on outside-click or Cancel.

---

## States & presentations

- **Default / populated**: 3-button grid + collapsed "Add details" + Recent list (up to 3 rows). Header shows latest timestamp.
- **Loading** (`recentRecords` undefined): header right shows a pulsing skeleton bar (`h-6 w-20`, themed `bg-stone-200 dark:bg-stone-800`). Quick-log buttons render normally.
- **Empty** (no records): header right is empty; `RecentEntriesList` renders nothing (returns null when records empty). Quick-log + details still available.
- **Quick-log submitting**: the tapped button shows a spinning `Loader2` and goes to `opacity-70`; all three buttons are `disabled` (`submittingAmount !== null`).
- **Details panel collapsed/expanded**: collapsed by default; expanded shows muted-background bordered panel with amount/note/time fields and submit.
- **Details submit pending** (`addMutation.isPending`): "Record with details" button shows a spinner and is disabled.
- **Row default vs editing**: a row in edit mode is replaced by the inline form on a `bg-muted/30` rounded background; non-editing rows are clickable with hover/active tint.
- **Row deleting** (`deletingId === record.id`): trash icon becomes a spinner and the button is disabled.
- **Success**: success-variant toast (green) on quick-log / details submit; default toast on edit/delete.
- **Error / validation**: destructive-variant toast on mutation failure or invalid edit datetime.
- **Offline / syncing**: no distinct in-card UI; writes succeed locally and queue for sync transparently.
- **Per-row content variants**: amount span only renders when `amountEstimate` set; note span only renders when `note` set (truncated).
- **Theme variants**: stone/amber gradient, stone icon (`CircleDot`), stone accent button (`bg-stone-600 hover:bg-stone-700`); light and dark variants for every token.

---

## Enums, options & configurable values

- **`DEFECATION_AMOUNT_OPTIONS`** (constants.ts):
  - `{ value: "small", label: "Small" }`
  - `{ value: "medium", label: "Medium" }`
  - `{ value: "large", label: "Large" }`
  - (Note: identical to `URINATION_AMOUNT_OPTIONS`. There is **no Bristol stool scale** in the code — size estimate is the only categorical field.)
- **"No estimate" sentinel**: `__none__` — represents "no amount estimate" in Selects; mapped to `undefined`/`""` before write.
- **Settings default amount** (`settings-store.ts`): `defecationDefaultAmount: "small" | "medium" | "large"`, store initial value **`"medium"`**. Pre-seeds the details-panel amount.
- **Recent list fetch limit**: `useDefecationRecords(5)` (fetches 5); `RecentEntriesList` `maxEntries` default = **3** displayed.
- **Undo toast duration**: **5000 ms** (`showUndoToast`).
- **Datetime input**: HTML `datetime-local`, format `"YYYY-MM-DDTHH:mm"`; details "When" `max` = now (no future); edit form datetime has no max clamp.
- **Theme tokens** (`CARD_THEMES.defecation`): label `"Defecation"`; icon `CircleDot`; gradient `from-stone-50 to-amber-50 dark:from-stone-950/40 dark:to-amber-950/40`; border `border-stone-200 dark:border-stone-800`; iconBg `bg-stone-100 dark:bg-stone-900/50`; iconColor `text-stone-600 dark:text-stone-400`; buttonBg `bg-stone-600 hover:bg-stone-700`; loadingBg `bg-stone-200 dark:bg-stone-800`; latestValueColor `text-stone-700 dark:text-stone-300`; sectionId `section-defecation`.
- **Field labels/text**: "Amount (optional)", placeholder "Select estimate", "Note (optional)", note placeholder "e.g. consistency, urgency", "When", "Add details", "Record with details", "Recent", standalone dialog title "Edit Defecation Entry" / description "Update the time, amount estimate, or note" / "Save Changes".

---

## Data model touched

- **Table**: `db.defecationRecords` (Dexie), indexed `"id, timestamp, updatedAt"` (db.ts; mirrored to Neon Postgres for sync, must stay in parity with `schema.ts`).
- **`DefecationRecord` interface** (db.ts):
  - `id: string` (generated via `generateId()`)
  - `timestamp: number` (ms epoch; defaults to `Date.now()`)
  - `amountEstimate?: string` (commented `"small" | "medium" | "large"`; stored only when non-empty)
  - `note?: string` (stored only when non-empty)
  - `createdAt: number`, `updatedAt: number`, `deletedAt: number | null` (soft-delete), `deviceId: string`, `timezone: string` — sync/audit fields populated by `syncFields()`.
- **Service ops** (`defecation-service.ts`): `addDefecationRecord(timestamp?, amountEstimate?, note?)`, `getDefecationRecords(limit?)`, `getDefecationRecordsByDateRange(start, end)`, `updateDefecationRecord(id, {timestamp?, amountEstimate?, note?})`, `deleteDefecationRecord(id)` (soft), `undoDeleteDefecationRecord(id)`. All writes go through `writeWithSync` + `schedulePush()`.
- **Hooks** (`use-defecation-queries.ts`): `useDefecationRecords(limit=10)` and `useDefecationRecordsByDateRange` (live queries via `useLiveQuery`); `useAddDefecation`, `useUpdateDefecation`, `useDeleteDefecation` (mutations).
- **Settings read**: `settings.defecationDefaultAmount` (Zustand, persisted to localStorage).

---

## Validation, edge cases & business rules

- **Amount and note are both optional**; a record can be created with neither (a bare quick-log records only amount; a "No estimate" + empty-note details submit records only the timestamp).
- **Trimming**: `addDefecationRecord` trims `amountEstimate` and `note`; empty-after-trim values are omitted entirely (the field is not written rather than stored as `""`).
- **`__none__` handling**: both the details panel and edit forms convert `__none__` to "no amount" (omitted/undefined) before writing.
- **Timestamp parsing**: `dateTimeLocalToTimestamp` throws on an unparseable datetime (never returns `NaN`); the edit flow catches this and shows "Invalid date/time", aborting the save. The details panel does not guard against this (input is constrained by `datetime-local`).
- **No future-dating in details panel**: "When" input `max` is now; the inline edit and standalone dialog datetime inputs are **not** max-clamped.
- **Quick-log concurrency guard**: while a quick-log write is pending (`submittingAmount !== null`) all three buttons are disabled, preventing double-submits.
- **Soft delete**: deletes set `deletedAt` rather than removing the row; `getActiveRecords` filters out soft-deleted rows; undo clears `deletedAt`. Undo window is the 5s toast lifetime (the record stays soft-deleted in DB regardless).
- **Default reset semantics**: after a details submit, amount resets to `settings.defecationDefaultAmount || ""` (falls back to empty string if the setting were unset).
- **Capitalization**: amount estimate is displayed `capitalize` in the recent list (stored lowercase).
- **Sync/timezone**: `syncFields()` stamps `deviceId` and `timezone`; records carry the device timezone for cross-device/day-start interpretation downstream.
- **No daily limit / over-limit concept**: defecation has no target or threshold (theme defines `progressOverLimit` but the card renders no progress bar). Unlike water/salt cards, there is nothing to be "over".

---

## Sub-components / variants

- **`DefecationCard`** — the dashboard card itself (quick-log grid + details panel + recent list with inline edit).
- **`CardShell`** — shared themed card chrome (gradient wrapper, icon+label header, `headerRight` slot for the latest-timestamp readout / skeleton).
- **`RecentEntriesList`** — shared "Recent" section: renders up to 3 rows via `renderEntry`, swaps a row for `renderEditForm` when editing, delete button per row.
- **`InlineEditFormShell`** — shared inline edit form (children slot for the amount Select, plus timestamp + note inputs and Save/Cancel).
- **`EditDefecationDialog`** — standalone modal edit dialog (used by `history-drawer.tsx` and `analytics/records-tab.tsx`, **not** by the card, which uses inline editing). Thin wrapper over `EditEstimateEntryDialog`.
- **`EditEstimateEntryDialog`** — shared "time + optional amount-estimate + note" modal (also used by urination); `allowNoEstimate` enables the `__none__` sentinel; accent `bg-stone-600 hover:bg-stone-700`, id prefix `edit-defecation`.
- **`useEditRecord`** — generic open/populate/submit-with-toast hook backing the inline edit (extra field: `editAmountEstimate`).
- **`useDeleteWithToast`** — delete-with-spinner + toast hook (`deletingId`, `handleDelete`).
- **`useUndoDeleteMutation`** — delete mutation that fires the 5s undo toast wired to `undoDeleteDefecationRecord`.
