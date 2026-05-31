# Verification — 19-edit-medication

**Verdict:** minor-gaps  ·  checked 78 claims, verified 73.

The document is a high-fidelity description of `PrescriptionViewDrawer` and its three tabs.
Nearly every structural, enum, default, label, styling, and validation claim matches the source
exactly. The one material problem is the **notification-resync claim** (stated twice): the
ScheduleTab saves via phase mutations that do **not** trigger a notification resync, contrary to
what the doc asserts. A handful of smaller omissions and one misleading file-attribution round
out the findings.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "Saving a schedule triggers a downstream notification resync (the schedule mutation hooks call `resyncNotifications()` → `syncMedicationNotifications()`; phase saves rewrite schedules)." (also restated under Validation: "schedule-level mutations resync local medication notifications; phase saves rewrite schedule rows (the resync is wired through schedule mutation hooks)") | The ScheduleTab saves via `useUpdatePhase`/`useStartNewPhase`, **neither of which has `onSuccess: resyncNotifications`**. Only `useAddSchedule`/`useUpdateSchedule`/`useDeleteSchedule` are wired to `resyncNotifications`, and those are NOT used by this drawer. Neither `phase-service.ts` (updatePhase/startNewPhase) nor `schedulePush()` calls `syncMedicationNotifications`. So saving a schedule in this drawer does NOT resync notifications. | `src/hooks/use-medication-queries.ts:170,178,185` (resync only on schedule hooks) vs `:189-199` (phase hooks, no onSuccess); `src/components/medications/edit-medication-drawer.tsx:165,177` (uses phase mutations) |
| low | Files-covered list attributes `useMedicineSearch` to `src/hooks/use-medication-queries.ts` ("read/mutation hooks the drawer consumes") and the Data-model section lists it among "Service / hook layer" entries alongside the medication-queries hooks. | `useMedicineSearch` is defined in and imported from `src/hooks/use-medicine-search.ts`, a separate file the doc never names. The drawer imports it on its own line. | `src/components/medications/edit-medication-drawer.tsx:23`; `src/hooks/use-medicine-search.ts:39` |
| low | Data-model "Reads" for `MedicationPhase` lists `foodInstruction` as read "via `usePhasesForPrescription`". | Correct that it's read, but `unit`/`foodInstruction` are read from the phase object resolved by `getMaintenancePhase`; `usePhasesForPrescription` returns the phase array. Minor wording — the hook returns phases, the util selects the one read. Not wrong, just imprecise. | `edit-medication-drawer.tsx:93-94,109-110` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | Info-tab review state has a key visual detail the doc only partially covers: warnings in review are rendered **verbatim** while contraindications are title-cased — doc states this for the stored view but the same title-casing/verbatim split also applies in the review list. (Confirmed, just under-cross-referenced.) | `edit-medication-drawer.tsx:587-588` (review contraindications title-cased), `:600-602` (review warnings verbatim) |
| low | `handleRefresh` swallows AI errors with `try/catch` + `console.error("Failed to refresh AI data", e)` and silently returns to the stored view (no error toast/banner). The doc's states section never mentions the error path. | `edit-medication-drawer.tsx:491-495` |
| low | `getActiveTitrationPhase` has a sibling `getPendingTitrationPhase` and `getEffectivePhase` in the same util; the drawer ignores pending titrations entirely (the banner only fires for an ACTIVE titration). Doc correctly scopes the banner to active, but does not note that a *pending* titration produces no banner. | `src/lib/medication-ui-utils.ts:33-55`; banner gate `edit-medication-drawer.tsx:197` |
| low | `PhaseSchedule.time` is marked `@deprecated` (use `scheduleTimeUTC`); the drawer reads/writes the deprecated `time` string and `updatePhase` derives `scheduleTimeUTC`/`anchorTimezone` from it. Doc says writes "set `scheduleTimeUTC`/`anchorTimezone` server-side" — it's actually computed client-side in `updatePhase` via `localHHMMStringToUTCMinutes`, not server-side. | `src/lib/db.ts:212-215`; `src/lib/phase-service.ts:253-254,283-284` |
| low | `startNewPhase` auto-completes any currently-active phase (sets prior active to `completed`, `endDate`) and can create a `pending` phase if `startDate > now`. The drawer always passes `startDate: Date.now()` so it's always `active`, but the doc doesn't note the phase-replacement side effect. | `src/lib/phase-service.ts:165-188` |
| low | The drawer file also exports/uses the `SchedRow` interface and `DAY_LABELS`/`ALL_DAYS` consts — all documented. No undocumented exported sub-component. (Noted for completeness; no omission.) | `edit-medication-drawer.tsx:82-90` |

## Spot-confirmed

- Container: `Drawer` capped `max-h-[90dvh] flex flex-col`; title = `genericName`; subtitle = `indication || "Prescription"`; re-selects live record `prescriptions.find(p => p.id === prescription?.id) || prescription`; returns `null` when unresolvable; default tab `schedule`. — `edit-medication-drawer.tsx:33,35,39,41,43,48`
- Tab values/labels: `schedule`/`details`/`info` → "Schedule"/"Details"/"Info". — `:51-53`
- `DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"]`, `ALL_DAYS = [0,1,2,3,4,5,6]`. — `:82-83`
- `getMaintenancePhase` prefers `type==="maintenance" && status==="active"`, falls back to any maintenance. — `medication-ui-utils.ts:16-19`
- `getActiveTitrationPhase` = `type==="titration" && status==="active" && !!titrationPlanId`. — `medication-ui-utils.ts:26-29`
- Hydration sorted ascending by `time` via `a.time.localeCompare(b.time)`; useEffect early-returns when `dirty`. — `:108,114`
- New row default `{ time: "20:00", dosage: "", daysOfWeek: [...ALL_DAYS] }`. — `:130`
- `toggleDay` re-sorts `daysOfWeek` ascending with `.sort((a,b) => a-b)`. — `:146`
- `isRowValid` = `!!r.dosage && parseFloat(r.dosage) > 0 && r.daysOfWeek.length > 0`. — `:153-154`
- `allRowsValid = rows.length > 0 && rows.every(isRowValid)`; `isSaving = updatePhase.isPending || startNewPhase.isPending`; `canSave = dirty && allRowsValid && !isSaving`. — `:158-160`
- Save persists via `updatePhase` (existing) else `startNewPhase` with `type: "maintenance"`, `startDate: Date.now()`; dosage stored as `parseFloat(r.dosage)`; existing rows keep `id`, new rows omit it. — `:162-191`
- `handleReset = () => setDirty(false)` (re-hydration then flows through useEffect). — `:193`
- Food-instruction options `["none","before","after"]`; labels `none → "Anytime"`, else `` `${fi} eating` `` → "before eating"/"after eating". — `:228,237`
- Unit default `"mg"`, free-text Input. — `:100,216-221`
- Dosage input `type="number" step="any" min="0"`; time `type="time"`; Notes `Textarea rows={3}`; AI textareas `rows={5}`. — `:261-263,256,423,551,560`
- Active titration banner amber (`bg-amber-50 dark:bg-amber-950/30`, `TrendingUp`), gated on `activeTitration`. — `:197-206`
- Empty-schedule placeholder "No doses scheduled. Add a time below." when `rows.length === 0`. — `:246-249`
- Day toggle selected = `bg-primary text-primary-foreground border-primary`; unselected = `text-muted-foreground border-input hover:bg-muted`. — `:286-288`
- Save accent `bg-teal-600 hover:bg-teal-700`; Loader2 spinner while saving. — `:321,325`
- DetailsTab read mode: Active toggle, Reason (`indication || "None specified"`), Notes (`notes || "No notes added."`), destructive Delete. Edit mode: Switch + Name/Reason/Notes inputs, X cancel + teal check save. — `:382-462`
- Active toggle dual behavior: read mode `handleToggleActive` persists immediately via mutateAsync; edit mode `onCheckedChange={setIsActive}` local-only, committed in `handleSave`. — `:407,436,370-376,355-361`
- Delete uses native `confirm("Permanently delete this prescription and all its history? This cannot be undone.")`, then `deletePrescription.mutateAsync` + `onOpenChange(false)`. — `:363-368`
- Delete cascade: hard-deletes doseLogs + inventoryTransactions; soft-deletes (`deletedAt`) inventory, phases, schedules, prescription. — `prescription-service.ts:145-166`
- DetailsTab useEffect resets name/indication/notes/isActive and exits edit on `prescription` change. — `:347-353`
- InfoTab: stored Contraindications (red `text-red-500 dark:text-red-400`) + Warnings (amber `text-amber-500 dark:text-amber-400`); contraindications title-cased `c.charAt(0).toUpperCase()+c.slice(1).toLowerCase()`, warnings verbatim; empty placeholders "No contraindications listed."/"No warnings listed." — `:632,647,636,651,640-642,655-657`
- Refresh calls `useMedicineSearch().mutateAsync(prescription.genericName)`; disabled while `isRefreshing || updatePrescription.isPending`. — `:484,625`
- Review state ("Review AI Information") with Reject/Edit/Accept; "None found." placeholders; Accept persists via `useUpdatePrescription`. — `:579,592,605,610-613,498-508`
- Edit-AI state: prefill `join("\n")`, Save splits `split("\n").map(trim).filter(Boolean)`, then persists + clears pending. — `:517-518,522-535`
- `useMedicineSearch` posts to `/api/ai/medicine-search`. — `use-medicine-search.ts:54`
- DB interfaces: `FoodInstruction = "before"|"after"|"none"`; `PhaseType = "maintenance"|"titration"`; phase `status: "active"|"completed"|"cancelled"|"pending"`; `Prescription` has `contraindications?`/`warnings?: string[]`. — `db.ts:137,173,185,157-158`
- `UpdatePhaseInput`/`CreatePhaseInput` shapes match (id, optional unit/foodInstruction/status, `schedules: {id?, time, daysOfWeek, dosage}[]` for update; prescriptionId/type/unit/startDate/foodInstruction/schedules for create). — `phase-service.ts:25-48`
- `compound-card-expanded.tsx` imports and renders `PrescriptionViewDrawer`. — `compound-card-expanded.tsx:17,285`
- `InteractionsSection`: AVOID (contraindications) / CAUTION (warnings) / INFO (warnings starting "Drug class:") badges; "Refresh interactions"; auth-gated via `useAuthGate()`. — `interactions-section.tsx:18,64,83,87,110`
- `BrandSwitchPicker`: `Dialog`, filters `!item.isArchived`, deactivates current active then activates selected, toast "Brand switched". — `brand-switch-picker.tsx:35,44,59-60,68`

## Low-confidence / could-not-verify

- The doc's `phase-service.ts` attribution for `startNewPhase`/`updatePhase`/`CreatePhaseInput`/`UpdatePhaseInput` is **correct** — they are defined there (`phase-service.ts:25,37,160,224`) and merely re-exported through `medication-service.ts:27-35`; the hooks import via that re-export. No discrepancy.
- "INFO badge / drug-class" classification in `InteractionsSection` keys off `text.startsWith("Drug class:")`, not a separate enum — the doc's "drug-class (INFO) badges" wording is accurate in spirit; the mechanism (a string prefix on a warning) is an implementation detail the doc abstracts. Not flagged as an inaccuracy.
- I did not execute the app; all findings are from static reading of the cited source. The notification-resync inaccuracy is asserted purely from the wiring (phase hooks lack `onSuccess`), which is unambiguous in the code.
