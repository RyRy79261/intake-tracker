# 05 — Urination card

**Files covered:**
- `/home/ryan/repos/Personal/intake-tracker/src/components/urination-card.tsx`
- `/home/ryan/repos/Personal/intake-tracker/src/components/edit-urination-dialog.tsx`
- `/home/ryan/repos/Personal/intake-tracker/src/hooks/use-urination-queries.ts`
- `/home/ryan/repos/Personal/intake-tracker/src/lib/urination-service.ts`
- `/home/ryan/repos/Personal/intake-tracker/src/lib/constants.ts` (`URINATION_AMOUNT_OPTIONS`)
- `/home/ryan/repos/Personal/intake-tracker/src/lib/card-themes.ts` (`urination` theme)
- `/home/ryan/repos/Personal/intake-tracker/src/components/card-shell.tsx` (outer chrome)
- `/home/ryan/repos/Personal/intake-tracker/src/components/recent-entries-list.tsx` (`RecentEntriesList`, `InlineEditFormShell`)
- `/home/ryan/repos/Personal/intake-tracker/src/components/edit-estimate-entry-dialog.tsx` (`EditEstimateEntryDialog`, wrapped by the modal variant)
- `/home/ryan/repos/Personal/intake-tracker/src/hooks/use-edit-record.ts`
- `/home/ryan/repos/Personal/intake-tracker/src/hooks/use-delete-with-toast.ts`
- `/home/ryan/repos/Personal/intake-tracker/src/hooks/use-undo-delete-mutation.ts`
- `/home/ryan/repos/Personal/intake-tracker/src/lib/record-crud.ts` (shared soft-delete CRUD)
- `/home/ryan/repos/Personal/intake-tracker/src/lib/db.ts` (`UrinationRecord` interface)
- `/home/ryan/repos/Personal/intake-tracker/src/stores/settings-store.ts` (`urinationDefaultAmount`)
- Rendered on the dashboard at `/home/ryan/repos/Personal/intake-tracker/src/app/page.tsx` inside `<div id="section-urination">`.

**Purpose:** A dashboard health card for one-tap logging of urination events with an optional coarse volume estimate (small/medium/large). It supports instant quick-log, an expandable details form (amount + free-text note + custom time), and an inline-editable "Recent" list of the last few entries, all stored offline-first in IndexedDB with background sync.

---

## Features

- **Card chrome (via `CardShell`).** Violet/purple themed gradient card with a `Droplet` icon, an uppercase "URINATION" label, and a right-aligned header slot.
- **Header-right "last logged" timestamp.** When at least one record exists, shows the latest record's timestamp formatted by `formatDateTime` (e.g. "Jan 15, 2:30 PM"). The "latest record" is derived as `recentRecords?.[0]` (the newest active record from the same `useUrinationRecords(5)` live query — not a separate fetch). Shows a pulsing skeleton while loading; renders nothing when there are no records.
- **Three quick-log buttons.** A 3-column grid of outline buttons — Small / Medium / Large — each writes a record immediately with `amountEstimate` set and `timestamp = now`, then fires a success toast. No confirmation step.
- **Per-button submitting state.** While a quick-log write is in-flight, the tapped button shows a spinner and is dimmed (`opacity-70`); all three buttons are disabled until the write resolves.
- **"Add details" expander.** A full-width ghost toggle (chevron up/down) that reveals/hides an inline details panel.
- **Details form** (when expanded):
  - **Amount (optional)** select, pre-filled from the user's `urinationDefaultAmount` setting (default "small"). Options: Small / Medium / Large.
  - **Note (optional)** multi-line textarea, placeholder "e.g. colour, urgency".
  - **When** `datetime-local` input, defaulting to now, capped at now via `max`.
  - **"Record with details"** submit button (themed violet); shows a spinner while the add mutation is pending.
- **Recent entries list (`RecentEntriesList`).** Shows up to 3 most-recent active records (the card subscribes to the latest 5, list slices to 3) under a "Recent" header with a top border separator.
  - Each row shows: formatted timestamp, capitalized `amountEstimate` (if present), and a truncated note (if present).
  - Each row is tappable to open an inline edit form, and has a trash/delete icon button.
- **Inline edit (`InlineEditFormShell`).** Tapping a recent row replaces it in place with an edit form: an Amount select + a date/time input + a note input + Save/Cancel. The card uses the **unlabeled** variant (`labeled` defaults to `false`), so the timestamp/note inputs render with `aria-label`s and a "Note (optional)" placeholder rather than visible `<Label>`s.
- **Delete with undo.** Deleting soft-deletes the record and shows an "Undo" toast for 5 seconds; undo reverses the soft-delete.
- **Offline-first persistence.** All writes go to Dexie/IndexedDB immediately and are enqueued for background sync to Neon Postgres (`writeWithSync` + `schedulePush`).
- **Live reactivity.** The recent list is a `useLiveQuery` over Dexie — it auto-updates after any add/edit/delete (including from other dashboard surfaces or sync).
- **Reused in Help/preview.** The same `UrinationCard` is mounted inside the help manual preview registry.

---

## User actions & interactions

| Action | Result |
|---|---|
| Tap **Small / Medium / Large** quick button | Immediately writes a record (`amountEstimate` = that value, `timestamp` = now); button shows spinner; success toast "Logged — Urination (small\|medium\|large) recorded"; on failure, destructive toast "Error — Failed to record". |
| Tap **Add details** | Toggles the details panel open/closed (chevron flips). |
| Change **Amount** select (details) | Sets the amount estimate to be saved (optional). |
| Type in **Note** textarea (details) | Sets free-text note (optional). |
| Change **When** datetime-local (details) | Sets the record timestamp; cannot select a time after now (`max` = now). |
| Tap **Record with details** | Writes a record with the chosen timestamp + (only if non-empty) amount + note; collapses the panel and resets amount to the default setting, note to empty, time to now; success/destructive toast. Button shows spinner while pending. |
| Tap a **recent entry row** | Opens the inline edit form for that record in place (also openable via Enter/Space when the row itself is focused — the keydown handler only fires when `e.target === e.currentTarget`, so key events bubbling up from inner controls are ignored). |
| In inline edit: change **Amount** select | Updates the amount estimate for that record. On save the value is mapped as `editAmountEstimate \|\| undefined`, so clearing the select to empty sends `amountEstimate: undefined` (the field is left out of the partial update) rather than the modal's `NONE_VALUE` sentinel. |
| In inline edit: change **date/time** input | Updates the record timestamp. |
| In inline edit: change **note** input | Updates the record note. |
| In inline edit: tap **Save** | Validates the timestamp, builds `{ timestamp, amountEstimate?, note }` updates, persists, closes the form; toast "Entry updated"; invalid date → "Invalid date/time" destructive toast; failure → "Error — Could not update the entry". |
| In inline edit: tap **Cancel** | Closes the edit form without saving. |
| Tap the **trash icon** on a row | Soft-deletes the record (row's delete icon shows a spinner while pending); shows "Entry deleted — Urination record removed" toast; the undo-delete mutation also surfaces a 5s **Undo** toast. `stopPropagation` prevents the row's edit-open. |
| Tap **Undo** in the toast | Reverses the soft-delete (record reappears). |

Note: `edit-urination-dialog.tsx` is a **modal** edit variant (`EditUrinationDialog` → `EditEstimateEntryDialog`) with Time / Amount (optional) / Note fields and Cancel / "Save Changes" footer. The current `urination-card.tsx` uses the **inline** edit form instead; the dialog is an available alternative edit presentation for the same record shape.

---

## States & presentations

- **Loading:** `recentRecords` is `undefined` → header-right shows a pulsing skeleton bar (`h-6 w-20`, themed `bg-violet-200 dark:bg-violet-800`).
- **Default / populated:** header-right shows the latest record's formatted timestamp; quick buttons enabled; Recent list shows up to 3 rows.
- **Empty:** no records → header-right renders nothing; `RecentEntriesList` returns `null` (no "Recent" section at all). Quick buttons still present and usable.
- **Quick-log submitting:** tapped button shows a spinner + `opacity-70`; all three quick buttons disabled.
- **Details panel collapsed vs expanded:** chevron-down (collapsed) / chevron-up (expanded); panel is a muted, bordered box.
- **Details submit pending:** "Record with details" button shows spinner (`addMutation.isPending`); button stays full width and themed.
- **Row default vs editing:** default row is clickable (hover/active background tint, `cursor-pointer`); when its id matches the editing id, it is replaced by the inline edit form on a `bg-muted/30` rounded panel.
- **Row delete in-progress:** the trash icon becomes a spinner and the delete button is disabled for that row.
- **Success:** themed success toast after quick-log / details add; plain toasts for edit ("Entry updated") and delete ("Entry deleted").
- **Error:** destructive toasts for failed add ("Failed to record"), failed update ("Could not update the entry"), failed delete ("Could not delete the entry").
- **Validation-error:** invalid date/time on edit save → "Invalid date/time" destructive toast, save aborted.
- **Offline / syncing:** no card-local offline UI; writes succeed locally and queue for sync transparently (offline-first). Live query keeps the list current as sync resolves.
- **Disabled:** quick buttons during any in-flight quick-log; details submit while pending; row delete button while that row is deleting.
- **Modal-dialog variant states:** `EditEstimateEntryDialog` open when `record !== null`; closes on overlay/escape (`onOpenChange`).

---

## Enums, options & configurable values

- **Amount options (`URINATION_AMOUNT_OPTIONS`)** — used by quick buttons, details select, and inline/modal edit selects:
  - `{ value: "small", label: "Small" }`
  - `{ value: "medium", label: "Medium" }`
  - `{ value: "large", label: "Large" }`
  - (The modal `edit-urination-dialog.tsx` defines an identical local `AMOUNT_OPTIONS` set.)
- **Default amount setting:** `urinationDefaultAmount: "small" | "medium" | "large"`, default `"small"` (Zustand settings store, persisted to localStorage; mutator `setUrinationDefaultAmount`). Pre-fills and resets the details Amount select.
- **Recent subscription limit:** card calls `useUrinationRecords(5)` (fetch latest 5).
- **Recent display cap:** `RecentEntriesList` `maxEntries` defaults to `3` (card does not override).
- **Undo toast duration:** 5000 ms (`showUndoToast`).
- **Modal sentinel:** `EditEstimateEntryDialog` uses `NONE_VALUE = "__none__"` and `allowNoEstimate` to optionally offer a "No estimate" item that maps to `""` — not enabled for urination (no `allowNoEstimate` passed), so urination edit always carries one of the three values once set.
- **Theme tokens (`card-themes.ts` → `urination`):** label "Urination"; icon `Droplet`; gradient `from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40`; border `border-violet-200 dark:border-violet-800`; iconBg `bg-violet-100 dark:bg-violet-900/50`; iconColor `text-violet-600 dark:text-violet-400`; buttonBg `bg-violet-600 hover:bg-violet-700`; loadingBg `bg-violet-200 dark:bg-violet-800`; latestValueColor `text-violet-700 dark:text-violet-300`; activeToggle `bg-violet-100 border-violet-300 dark:bg-violet-900/50 dark:border-violet-700`; `progressOverLimit: bg-red-500`; `sectionId: "section-urination"`.
- **Modal accent:** `accentClassName="bg-violet-600 hover:bg-violet-700"`, `idPrefix="edit-urination"`.
- **Timestamp format (`formatDateTime`):** `en-US`, `{ month:"short", day:"numeric", hour:"numeric", minute:"2-digit", hour12:true }`.
- **Note placeholders:** details textarea and edit dialog use "e.g. colour, urgency".

---

## Data model touched

**Table:** `urinationRecords` (Dexie / IndexedDB; mirrored to Neon Postgres). Dexie index: `"id, timestamp, updatedAt"`.

**Interface `UrinationRecord` (`db.ts`):**
- `id: string` (generated via `generateId()`)
- `timestamp: number` (event time, ms; defaults to `Date.now()` if not supplied)
- `amountEstimate?: string` (free string, but UI constrains to "small"/"medium"/"large"; trimmed, omitted when empty)
- `note?: string` (trimmed, omitted when empty)
- `createdAt: number`, `updatedAt: number` (from `syncFields()`)
- `deletedAt: number | null` (soft-delete marker; `null` = active)
- `deviceId: string`, `timezone: string` (sync/audit fields from `syncFields()`)

**Service (`urination-service.ts`) operations:**
- `addUrinationRecord(timestamp?, amountEstimate?, note?)` → trims/omits empty fields, writes via `writeWithSync("urinationRecords","upsert")`, schedules push.
- `getUrinationRecords(limit?)` → active records newest-first, capped (via `getActiveRecords`).
- `getUrinationRecordsByDateRange(start, end)` → active records in half-open `[start, end)` window (used by analytics/history, not the card UI directly).
- `deleteUrinationRecord(id)` / `undoDeleteUrinationRecord(id)` → soft-delete / restore (sets/clears `deletedAt`).
- `updateUrinationRecord(id, { timestamp?, amountEstimate?, note? })` → partial update, bumps `updatedAt`; returns "Record not found" for missing id.

**Hooks (`use-urination-queries.ts`):** `useUrinationRecords(limit=10)`, `useUrinationRecordsByDateRange`, `useAddUrination`, `useUpdateUrination`, `useDeleteUrination` (undo-aware). `useUrinationRecordsByDateRange` guards its inputs — it only runs the range query when `startTime < endTime`, otherwise it resolves to `[]` (`Promise.resolve([])`).

---

## Validation, edge cases & business rules

- **No required fields beyond a timestamp.** Quick-log writes only `amountEstimate`. A record can have no amount and no note (e.g. a details submit with both blank still saves a valid timestamped event).
- **Empty-string stripping (service-layer).** Trimming and empty-omission happen in `addUrinationRecord`/`updateRecord` (the service), not in the card. `amountEstimate` and `note` are trimmed there; empty results are omitted (the field stays absent on the record, not stored as `""`).
- **Details spread guard (card-layer).** The details add uses `...(amount && {...})` / `...(note && {...})` so empty (falsy) values aren't sent. Note this guard passes the **raw** values — it does not trim, so a whitespace-only note (e.g. `"   "`) is truthy and *is* forwarded to the service, which then trims it to `""` and omits it. Net result matches the desired behaviour, but the stripping of whitespace-only values is done by the service, not the card guard.
- **Timestamp default & cap.** Add defaults `timestamp` to `Date.now()`. The details "When" input is capped at now (`max=getCurrentDateTimeLocal()`), discouraging future-dated entries; the edit datetime inputs are **not** similarly capped — neither the inline `InlineEditFormShell` input nor the modal `EditEstimateEntryDialog` timestamp input sets a `max`.
- **Edit timestamp validation.** `dateTimeLocalToTimestamp` throws on an unparseable value; `useEditRecord` catches it and shows "Invalid date/time" instead of crashing. `buildUpdates` returning `null` would abort silently (not used here).
- **Soft delete, not hard delete.** Deletes set `deletedAt`; reads filter `deletedAt === null`. Provides the 5s undo window.
- **Newest-first ordering** by `timestamp` (Dexie `orderBy("timestamp").reverse()`), then capped.
- **Local-time conversions.** `getCurrentDateTimeLocal` / `timestampToDateTimeLocal` apply the device timezone offset so datetime-local inputs reflect local wall-clock; stored `timestamp` is absolute ms.
- **No daily total / limit logic** in this card (unlike water/salt). The violet theme defines progress/over-limit tokens but the urination card does not render a progress bar or enforce thresholds.
- **Stale-closure safety.** `useEditRecord` holds callbacks in a ref so save always uses the latest form state.
- **Delete vs edit click isolation.** The trash button calls `stopPropagation` so deleting doesn't also open the edit form.
- **Reset-on-success.** A successful details submit resets amount to the default setting, clears the note, resets time to now, and collapses the panel.

---

## Sub-components / variants

- **`UrinationCard`** — the dashboard card: quick-log grid, details expander, recent list, inline edit.
- **`CardShell`** — shared themed outer card (gradient, icon, label, header-right slot).
- **`RecentEntriesList`** — shared recent-entries section: row rendering, click-to-edit, delete button, inline-edit slot (max 3 shown).
- **`InlineEditFormShell`** — shared inline edit form layout (children + timestamp + note + Save/Cancel).
- **`EditUrinationDialog`** — modal edit variant for urination records (thin wrapper).
- **`EditEstimateEntryDialog`** — shared modal for the "time + optional amount-estimate + note" pattern (also used by Defecation); supports optional "No estimate" sentinel.
- **`useEditRecord`** — generic open/edit/submit state machine for tap-to-edit.
- **`useDeleteWithToast`** — per-row delete spinner + toast.
- **`useUndoDeleteMutation`** — delete mutation that surfaces the 5s undo toast.
- **`record-crud.ts`** — shared soft-delete CRUD helpers (`getActiveRecords`, `getRecordsBetween`, `softDeleteRecord`, `undoSoftDeleteRecord`, `updateRecord`).
- **`showUndoToast`** — undo toast (5s) used by the delete mutation.
