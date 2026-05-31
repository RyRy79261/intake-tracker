# Verification — 06-defecation

**Verdict:** minor-gaps  ·  checked 78 claims, verified 72.

All "Files covered" were read in full, plus the related code surface: `record-crud.ts`,
`undo-toast.tsx`, `date-utils.ts`, `utils.ts` (`syncFields`/`generateId`), `card-shell.tsx`,
the settings defaults UI, and the two `EditDefecationDialog` call sites
(`history-drawer.tsx`, `analytics/records-tab.tsx`). The document is largely faithful. The
only substantive issue is the delete-toast description: the card fires a different success
message than the doc states, and it does NOT mention that two toasts fire on a delete.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "Toast feedback ... 'Entry deleted' / error on delete" (line 29) and "raises a 5-second 'Record deleted' toast" (line 28) implies one delete toast | Two separate toasts fire on a delete: (1) `useDeleteWithToast` shows `title: "Entry deleted"`, `description: "Defecation record removed"`; (2) `useUndoDeleteMutation.onSuccess` shows the undo toast `title: "Record deleted"`. The doc never states the success message is "Defecation record removed" and never notes the dual-toast behavior. | `use-delete-with-toast.ts:26-29`; `use-undo-delete-mutation.ts:21-23`; `defecation-card.tsx:50` |
| low | `useDeleteWithToast(deleteMutation, "Defecation record removed")` — the description string is not documented anywhere; doc only mentions "Entry deleted" | Actual description passed is `"Defecation record removed"` | `defecation-card.tsx:50` |
| low | "Trimming: `addDefecationRecord` trims `amountEstimate` and `note`" (line 105) — implies the quick-log path also trims a user-entered value | True that the service trims, but quick-log passes the hard-coded literals "small"/"medium"/"large" which have no whitespace; trimming only ever matters for the (already-constrained) details/edit paths. Minor over-statement, the trim claim itself is correct. | `defecation-service.ts:20-26` |
| low | "store default is `\"medium\"`" / "store initial value `\"medium\"`" (lines 24, 78) — correct, but doc line 24 also says the seed is "one of small/medium/large" | Type union is exactly `"small" \| "medium" \| "large"`; initial `"medium" as const`. Confirmed accurate (listed here only as a spot-confirm of the digit-for-digit value). | `settings-store.ts:85,209` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| medium | Delete fires TWO toasts (success toast + undo toast), not one. The undo toast carries `duration: 5000` and an `Undo` action that calls `undoDeleteDefecationRecord`. Doc describes only the undo toast. | `use-delete-with-toast.ts:25-35`; `use-undo-delete-mutation.ts:19-24`; `undo-toast.tsx:23-28` |
| low | Edit-submit success toast is `title: "Entry updated"` (no description); edit-failure toast is `title: "Error"`, `description: "Could not update the entry"`. Doc says "'Entry updated' / error on edit" but omits the exact failure copy. | `use-edit-record.ts:111,114-116` |
| low | Delete-failure toast copy is `title: "Error"`, `description: "Could not delete the entry"`. Doc only says "error on delete". | `use-delete-with-toast.ts:31-34` |
| low | `getRecordsBetween` (date-range read used by `useDefecationRecordsByDateRange`) is a **half-open** window `[start, end)` — endTime exclusive — and filters soft-deleted rows. Doc lists the hook but not the half-open semantics. | `record-crud.ts:49-56` |
| low | `useDefecationRecordsByDateRange` short-circuits to `Promise.resolve([])` when `startTime >= endTime` (guards inverted ranges). Not mentioned. | `use-defecation-queries.ts:39-43` |
| low | `getActiveRecords` reads the **entire** table via `orderBy("timestamp").reverse().toArray()` then filters `deletedAt === null` in JS and slices to `limit` — i.e. the limit is applied post-filter in memory, not via an indexed query. Doc says "fetches 5" without this nuance. | `record-crud.ts:35-42` |
| low | `updateDefecationRecord` returns `err("Record not found")` for a missing id (does not silently succeed). Not mentioned in the data-model/edge-case sections. | `record-crud.ts:114-115` |
| low | `InlineEditFormShell` has a `labeled` mode (renders visible `<Label>`s) and an `idPrefix` prop; the defecation card uses the **unlabeled** default (placeholder + `aria-label`). Doc describes the shell generically without noting the card uses the unlabeled variant. | `recent-entries-list.tsx:18-69`; `defecation-card.tsx:241` |
| low | The recent-row keyboard handler only activates when `e.target === e.currentTarget` (ignores key events bubbling from inner focusables). Doc says "keyboard-activatable: Enter/Space" without this guard detail. | `recent-entries-list.tsx:143` |
| low | `getDeviceId()` returns the literal `"server"` when `window` is undefined (SSR); `syncFields()` also stamps `createdAt`/`updatedAt`/`deletedAt:null`. Doc mentions deviceId/timezone but not the full set or the SSR fallback. | `utils.ts:33-52` |
| low | The recent-row delete button has `aria-label="Delete entry"`; the row container gets `role="button"`/`tabIndex={0}` only when `onEdit` is provided. Accessibility attributes not documented. | `recent-entries-list.tsx:138-139,158` |

## Spot-confirmed

- One-tap quick-log: 3-button grid mapped from `AMOUNT_OPTIONS`, each calls `handleQuickLog(opt.value)`, no confirmation; record stamped `Date.now()` (service default) with chosen `amountEstimate`. `defecation-card.tsx:137-154,76-94`; `defecation-service.ts:23-25`.
- Quick-log toast copy: `title: "Logged"`, `description: \`Defecation (${amountValue}) recorded\``, `variant: "success"`; failure `title: "Error"`, `description: "Failed to record"`, `variant: "destructive"`. `defecation-card.tsx:80-90`.
- Quick-log concurrency guard: all three buttons `disabled={submittingAmount !== null}`; tapped button gets `opacity-70` + spinner. `defecation-card.tsx:143-151`.
- "Add details" collapsed by default (`useState(false)`), ghost button with `ChevronUp`/`ChevronDown` flip. `defecation-card.tsx:40,156-164`.
- Details amount seeded from `settings.defecationDefaultAmount || ""`; reset to same after submit. `defecation-card.tsx:41,111`.
- Details Select adds `__none__` "No estimate" sentinel; submit maps `__none__`/empty → omit `amountEstimate`; omits `note` when blank. `defecation-card.tsx:99-104,175`.
- Details "When" input: `type="datetime-local"`, `max={getCurrentDateTimeLocal()}` (now-clamped, no future). Edit inline form and standalone dialog datetime inputs have NO max. `defecation-card.tsx:196-202`; `recent-entries-list.tsx:55,66`; `edit-estimate-entry-dialog.tsx:88-95`.
- Details submit button copy "Record with details", spinner + `disabled` on `addMutation.isPending`; on success collapses panel + resets note/time. `defecation-card.tsx:204-214,110-113`.
- Header latest-timestamp: skeleton `h-6 w-20 ... animate-pulse` themed `loadingBg` while `!recentRecords`; else `formatDateTime(latestRecord.timestamp)`; else null. `defecation-card.tsx:127-133`.
- `formatDateTime` produces e.g. "Jan 15, 2:30 PM" (toLocaleString en-US, month short/day numeric/hour numeric/minute 2-digit/hour12). `date-utils.ts:87-95`.
- Recent list: `useDefecationRecords(5)` fetches 5; `RecentEntriesList` `maxEntries` default = 3, slices `records.slice(0,3)`; returns null when empty. `defecation-card.tsx:45`; `recent-entries-list.tsx:105,110,112`.
- Per-row content: timestamp always; `amountEstimate` span only when set (`capitalize`); `note` span only when set (`truncate`). `defecation-card.tsx:227-238`.
- Inline edit: tapping row opens form (Select + datetime + note + Save/Cancel via `InlineEditFormShell`); `__none__` → `undefined` in `buildUpdates`; invalid datetime → `"Invalid date/time"` destructive toast + abort. `defecation-card.tsx:64-72,240-254`; `use-edit-record.ts:94-99`.
- Delete: trash icon per row, `stopPropagation` on click, spinner + disabled when `deletingId === record.id`. `recent-entries-list.tsx:155-171`.
- Undo toast: `duration: 5000`, `Undo` action → `undoDeleteDefecationRecord(id)` → clears `deletedAt`. `undo-toast.tsx:23-28`; `use-undo-delete-mutation.ts:21-23`; `record-crud.ts:79-95`.
- `DEFECATION_AMOUNT_OPTIONS` = small/medium/large, identical to `URINATION_AMOUNT_OPTIONS`; no Bristol scale anywhere. `constants.ts:80-92`.
- `DefecationRecord` interface fields exactly as documented; `amountEstimate?: string // "small" | "medium" | "large"` comment present. `db.ts:124-134`.
- Table index `defecationRecords: "id, timestamp, updatedAt"`. `db.ts:471`.
- `CARD_THEMES.defecation` tokens digit-for-digit match doc line 82: label "Defecation", icon `CircleDot`, gradient `from-stone-50 to-amber-50 dark:from-stone-950/40 dark:to-amber-950/40`, border `border-stone-200 dark:border-stone-800`, iconBg `bg-stone-100 dark:bg-stone-900/50`, iconColor `text-stone-600 dark:text-stone-400`, buttonBg `bg-stone-600 hover:bg-stone-700`, loadingBg `bg-stone-200 dark:bg-stone-800`, latestValueColor `text-stone-700 dark:text-stone-300`, sectionId `section-defecation`. `card-themes.ts:206-226`.
- `EditDefecationDialog` wraps `EditEstimateEntryDialog` with `allowNoEstimate`, accent `bg-stone-600 hover:bg-stone-700`, idPrefix `edit-defecation`, title "Edit Defecation Entry", note placeholder "e.g. consistency, urgency". `edit-defecation-dialog.tsx:21-33`.
- Standalone dialog used by History drawer and Analytics records tab, NOT by the card. `history-drawer.tsx:17,360`; `analytics/records-tab.tsx:13,522`.
- Dialog description "Update the time, amount estimate, or note"; "Save Changes" / "Cancel"; closes on `onOpenChange`/outside-click. `edit-estimate-entry-dialog.tsx:83,129-134,79`.
- Service ops signatures: `addDefecationRecord(timestamp?, amountEstimate?, note?)`, `getDefecationRecords(limit?)`, `getDefecationRecordsByDateRange(start,end)`, `updateDefecationRecord(id, updates)`, `deleteDefecationRecord(id)` (soft), `undoDeleteDefecationRecord(id)`; all via `writeWithSync` + `schedulePush()`. `defecation-service.ts:14-65`.
- Hooks: `useDefecationRecords(limit=10)` default (card overrides with 5) and `useDefecationRecordsByDateRange` via `useLiveQuery`; `useAddDefecation`/`useUpdateDefecation`/`useDeleteDefecation`. `use-defecation-queries.ts:31-66`.
- No progress bar / daily limit: theme defines `progressOverLimit: "bg-red-500"` but card renders no progress widget. `card-themes.ts:218`; `defecation-card.tsx` (no progress UI).
- Soft delete sets `deletedAt`/`updatedAt`; `getActiveRecords` filters `deletedAt === null`; undo clears it. `record-crud.ts:35-42,59-95`.

## Low-confidence / could-not-verify

- "Offline-first ... queued for background sync to Neon Postgres" (line 30) — `writeWithSync` + `schedulePush` are invoked, but the full offline-queue/sync-engine behavior was not traced into `sync-queue.ts`/`sync-engine.ts`; the card-level claim (writes go through those functions) is confirmed, the end-to-end Neon sync is taken on trust.
- "Live updates ... re-renders via `useLiveQuery` ... on a sync pull" (line 31) — `useLiveQuery` wiring confirmed (`use-defecation-queries.ts:31-33`); whether a sync-pull mutates the Dexie table in a way that triggers re-render is plausible but not directly verified here.
- Doc line 24/78 store default "medium" is correct; the union-type ordering and any settings UI clamping beyond the Select were only spot-checked in `urination-defecation-defaults.tsx` (binds `settings.defecationDefaultAmount`), not exhaustively.
