# Verification — 05-urination

**Verdict:** accurate · checked 78 claims, verified 76.

Read every file in the doc's "Files covered" list plus `db.ts`, `constants.ts`,
`settings-store.ts`, `date-utils.ts`, `undo-toast.tsx`, `page.tsx`, and
`preview-registry.tsx`. Grepped the repo for all `UrinationCard` usages. The
document is an accurate, high-fidelity description of the actual implementation.
Two nitpick-level inaccuracies only; no behavior is materially misrepresented.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "Type in **Note** textarea (details) | Sets free-text note (optional)" and lines 32/116/136 imply the *details* note is trimmed before storage. | The `urination-card.tsx` details path spreads `...(note && { note })` (raw `note`, no trim) — trimming happens in the *service* (`addUrinationRecord` trims). So the card itself does not trim; the trim/omit is a service-layer behavior. The doc's "trimmed, omitted when empty" is correct at the service level (where it claims it), so this is only a precision note on the `...(note && ...)` "spread guard" described at line 138 — a blank-after-trim note (e.g. `"   "`) is truthy and *is* sent to the service, which then trims it to `""` and omits it. Net result matches the doc; the guard alone wouldn't strip whitespace-only notes. | `urination-card.tsx:101-102`; `urination-service.ts:24-26` |
| low | Line 138: "edit inputs are not similarly capped" — framed as edit datetime input lacks a `max`. | True for the inline edit form (`InlineEditFormShell` datetime `<Input>` has no `max`, recent-entries-list.tsx:55/66) AND for the modal `EditEstimateEntryDialog` (timestamp `<Input>` has no `max`, edit-estimate-entry-dialog.tsx:88-95). Claim is correct; included only to confirm it covers both edit surfaces. | `recent-entries-list.tsx:55,66`; `edit-estimate-entry-dialog.tsx:88-95` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The card's `latestRecord` (header "last logged") is `recentRecords?.[0]` — the newest active record from the `useUrinationRecords(5)` live query, not a separate fetch. Doc says "latest record's timestamp" (correct) but does not name the `[0]` derivation. | `urination-card.tsx:74` |
| low | `useUrinationRecordsByDateRange` guards `startTime < endTime` and returns `Promise.resolve([])` when not — a small edge-case the doc omits (it does note the range query exists). | `use-urination-queries.ts:39-44` |
| low | Inline edit form uses the **unlabeled** variant of `InlineEditFormShell` (default `labeled=false`), so timestamp/note inputs render via `aria-label` + placeholder ("Note (optional)"), not visible `<Label>`s. Doc describes "a date/time input + a note input" without noting the unlabeled/placeholder presentation. | `recent-entries-list.tsx:27,64-68`; `urination-card.tsx:239` |
| low | Recent-row keyboard activation only fires when `e.target === e.currentTarget` (guards against bubbled key events from inner controls). Doc mentions Enter/Space opens edit but not this self-target guard. | `recent-entries-list.tsx:143` |
| low | The inline edit Save builds updates as `amountEstimate: editAmountEstimate || undefined` — clearing the select to empty maps to `undefined` (field left unchanged on the partial update path / not set), distinct from the modal's `NONE_VALUE` sentinel. Doc covers the modal sentinel but not this card-side `|| undefined` mapping. | `urination-card.tsx:67-70` |
| low | `Dialog onOpenChange` calls `onClose()` only on close (`!o && onClose()`); overlay/escape close path. Doc notes "closes on overlay/escape" — confirmed, not an omission, listed for completeness. | `edit-estimate-entry-dialog.tsx:79` |

## Spot-confirmed

- Three quick-log buttons in a `grid-cols-3`, outline, `h-10`, disabled while `submittingAmount !== null`, spinner + `opacity-70` on the tapped one. `urination-card.tsx:136-153`
- Quick-log writes `{ amountEstimate: amountValue }` (no explicit timestamp → service defaults `Date.now()`), success toast `"Logged" / "Urination (${amountValue}) recorded" / success`, failure `"Error" / "Failed to record" / destructive`. `urination-card.tsx:79-93`; `urination-service.ts:23`
- Details form: Amount select pre-filled from `settings.urinationDefaultAmount`, Note textarea placeholder `"e.g. colour, urgency"`, `datetime-local` "When" input capped `max={getCurrentDateTimeLocal()}`, submit "Record with details" themed `theme.buttonBg`, spinner on `addMutation.isPending`. `urination-card.tsx:41,168-212`
- Details submit success resets amount to default, note `""`, time to now, collapses panel. `urination-card.tsx:109-112`
- `URINATION_AMOUNT_OPTIONS` = `{small,Small},{medium,Medium},{large,Large}`; modal `edit-urination-dialog.tsx` defines an identical local `AMOUNT_OPTIONS`. `constants.ts:80-84`; `edit-urination-dialog.tsx:7-11`
- `urinationDefaultAmount: "small"|"medium"|"large"`, default `"small"`, mutator `setUrinationDefaultAmount`, Zustand persisted. `settings-store.ts:84,149,208,398`
- Card subscribes `useUrinationRecords(5)`; hook default param is `10`; `RecentEntriesList` `maxEntries` default `3` (card does not override). `urination-card.tsx:45`; `use-urination-queries.ts:31`; `recent-entries-list.tsx:105`
- `urination` theme tokens verified digit-for-digit: label "Urination", icon `Droplet`, gradient `from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40`, border `border-violet-200 dark:border-violet-800`, iconBg `bg-violet-100 dark:bg-violet-900/50`, iconColor `text-violet-600 dark:text-violet-400`, buttonBg `bg-violet-600 hover:bg-violet-700`, loadingBg `bg-violet-200 dark:bg-violet-800`, latestValueColor `text-violet-700 dark:text-violet-300`, activeToggle `bg-violet-100 border-violet-300 dark:bg-violet-900/50 dark:border-violet-700`, progressOverLimit `bg-red-500`, sectionId `section-urination`. `card-themes.ts:185-205`
- Modal accent `accentClassName="bg-violet-600 hover:bg-violet-700"`, `idPrefix="edit-urination"`, no `allowNoEstimate` passed (so no "No estimate" item). `edit-urination-dialog.tsx:33-35`; `edit-estimate-entry-dialog.tsx:38,64,100,109`
- `NONE_VALUE = "__none__"` sentinel, `allowNoEstimate` default `false`. `edit-estimate-entry-dialog.tsx:24,64`
- Loading skeleton `h-6 w-20 rounded animate-pulse` themed `loadingBg`; empty → header renders `null`; `RecentEntriesList` returns `null` when no records. `urination-card.tsx:126-133`; `recent-entries-list.tsx:110`
- Header-right shows `formatDateTime(latestRecord.timestamp)` as `text-xs text-muted-foreground`. `urination-card.tsx:128-131`
- `formatDateTime` = `toLocaleString("en-US", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit", hour12:true })`. `date-utils.ts:87-95`
- `UrinationRecord` interface: `id`, `timestamp:number`, `amountEstimate?:string`, `note?:string`, `createdAt`, `updatedAt`, `deletedAt:number|null`, `deviceId`, `timezone`. `db.ts:112-122`
- Dexie index `"id, timestamp, updatedAt"`. `db.ts:470` (and v-repeats)
- Service: `addUrinationRecord` trims amount+note, omits when undefined/empty, `writeWithSync("urinationRecords","upsert")` + `schedulePush`, `id: generateId()`, `timestamp: timestamp ?? Date.now()`, `...syncFields()`. `urination-service.ts:14-39`
- `getUrinationRecords(limit?)` → `getActiveRecords` (newest-first via `orderBy("timestamp").reverse()`, filter `deletedAt === null`, slice limit). `urination-service.ts:41-43`; `record-crud.ts:35-42`
- `getUrinationRecordsByDateRange` → `getRecordsBetween` half-open `[start,end)` via Dexie `.between` default. `urination-service.ts:45-50`; `record-crud.ts:49-56`
- `deleteUrinationRecord`/`undoDeleteUrinationRecord` → soft-delete/restore via `record-crud` (sets/clears `deletedAt`, bumps `updatedAt`). `urination-service.ts:52-58`; `record-crud.ts:59-96`
- `updateUrinationRecord` → `updateRecord`, returns `err("Record not found")` for missing id, bumps `updatedAt`. `urination-service.ts:60-65`; `record-crud.ts:103-125`
- `useDeleteUrination` = `useUndoDeleteMutation` which calls `showUndoToast` (duration 5000 ms). `use-urination-queries.ts:64-66`; `use-undo-delete-mutation.ts:14-25`; `undo-toast.tsx:23-28`
- Delete-with-toast: per-row `deletingId` spinner, success "Entry deleted"/successMessage `"Urination record removed"`, failure "Error"/"Could not delete the entry". `use-delete-with-toast.ts:14-44`; `urination-card.tsx:50`
- Edit submit: `dateTimeLocalToTimestamp` throws on invalid → caught → "Invalid date/time" destructive; success toast "Entry updated"; failure "Error"/"Could not update the entry"; `buildUpdates` null aborts silently. `use-edit-record.ts:86-121`; `date-utils.ts:33-39`
- Stale-closure ref in `useEditRecord` (`optionsRef.current`). `use-edit-record.ts:72-73`
- Trash button `e.stopPropagation()` before delete; disabled while `deletingId === record.id`. `recent-entries-list.tsx:160-164`
- `CardShell` renders gradient `Card`, `p-6` content, icon-in-`iconBg` + uppercase label, `headerRight` slot. `card-shell.tsx:22-47`
- Reused in help/preview registry under `"urination-and-bowel"`. `preview-registry.tsx:7,52-55`
- Rendered on dashboard inside `<div id="section-urination">`. `page.tsx:60-61`

## Low-confidence / could-not-verify

- None. Every claim resolved to a concrete source line. The doc's "No daily total / limit logic in this card" (line 143) is consistent with the code: the violet theme defines `progressOverLimit: bg-red-500` but `urination-card.tsx` renders no progress bar and imports no limit logic (`card-themes.ts:197`; `urination-card.tsx` whole-file). The "Live reactivity" via `useLiveQuery` claim is confirmed by `use-urination-queries.ts:31-33`.
