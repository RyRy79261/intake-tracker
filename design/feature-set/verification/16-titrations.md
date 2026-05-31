# Verification — 16-titrations

**Verdict:** accurate  ·  checked 96 claims, verified 93.

This doc is unusually faithful to the source. Every file in "Files covered" was read in full, plus the
supporting service/hook/db chain (`prescription-service.ts`, `medication-schedule-service.ts`,
`phase-service.ts`, `compound-utils.ts`, `med-footer.tsx`, `auth-guard.tsx`). The few flags below are
small wording/precision nits, not behavioral errors.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "**Day-of-week labels** `DAY_LABELS_LONG`" — the name says "LONG" and the doc calls them "Day-of-week labels", implying long names. | The constant holds **short** 3-letter labels `["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]`. The doc reproduces the values correctly, but its prose framing ("LONG") is misleading — this is the code's own misnomer, faithfully copied. | `src/components/medications/titrations/types.ts:6` |
| low | Request schema "fields per prescription: `genericName` (required), optional `currentDosage`, `newDosage`, `newSchedule[]`, `newTotalDaily`, `frequency`". Presented as what the unit sends. | The *zod schema* (route) does accept all those optional fields, but the **client only ever sends** `genericName`, `newSchedule`, `newTotalDaily`, `frequency`; it never sends `currentDosage` or `newDosage`. Doc is correct about the schema but the two unused fields are dead for this unit. | route `route.ts:14-20`; client `titration-drawer.tsx:90-95` |
| low | "Audit logging. Every mutation writes an audit entry (`phase_started`, `titration_plan_updated`, `phase_activated`, `phase_completed`)." | Accurate, but note **cancel AND delete both reuse `"phase_completed"`** (disambiguated only by a metadata `action` field `titration_cancelled` / `titration_deleted`). The doc's list is right; the reuse is worth flagging as it could read as four distinct lifecycle actions. | `titration-service.ts:554` (cancel), `:599` (delete) |
| low | "Header line: ... plus a 'New' button (Plus icon)." Implies the Medications page renders a tab header. | The header text + New button live inside `TitrationsView` itself, not the page-level tab bar; the page just conditionally mounts `<TitrationsView />`. Minor attribution nuance — behavior is as described. | `titrations-view.tsx:33-46`; `page.tsx:61` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | `prefillFromPlan` start-mode logic on edit: if `recommendedStartDate` exists → date is set + `startNow=false`; **else `startNow = (plan.status === "active")`**. The doc says edit "reloads ... start" but doesn't capture this active-plans-default-to-immediate fallback. | `use-titration-drawer-form.ts:124-129` |
| low | Activate button has a distinct **teal** styling (`bg-teal-600 hover:bg-teal-700`), Complete & Promote is **emerald**, Cancel/Delete are **red**. Doc covers status-badge colors thoroughly but not the action-button colors. | `titration-plan-card.tsx:168,183,216,267` |
| low | `getActiveTitrationPhaseForPrescription(prescriptionId)` read fn exists (returns the active titration phase override) and `getTitrationPlanById` / `getActiveTitrationPlans` reads. Doc lists most reads under "Sub-components" but the per-prescription override checker is only named, not its semantics. | `titration-service.ts:77-87,45-52` |
| low | `getConditionLabels()` also folds in every prescription `indication` (not just plan labels) and returns a sorted unique set — used for condition-label suggestions elsewhere. Doc lists it by name only. | `titration-service.ts:59-71` |
| low | Schedule line renders the **deprecated `s.time` HH:MM string** (not derived from `scheduleTimeUTC`) in both `PhaseEntryRow`, `MaintenanceRow`, and the prefill panel. The doc notes `scheduleTimeUTC` is the source of truth for writes but doesn't note display still reads the legacy `time` field. | `titration-plan-card.tsx:313`; `maintenance-row.tsx:40`; `rx-entry-card.tsx:177` |
| low | `usePrescriptions()` returns ALL non-deleted prescriptions (`getPrescriptions` filters only `deletedAt`); `TitrationsView` itself does the `isActive` filter before passing to the drawer & Current Maintenance. Doc says drawer receives "active prescriptions" (correct) but the underlying hook is not active-filtered. | `prescription-service.ts:41-44`; `titrations-view.tsx:24,101` |

## Spot-confirmed

- Tab set `schedule | prescriptions | medications | titrations | settings` and titrations icon = `TrendingUp`. `med-footer.tsx:7-14`; `page.tsx:61`.
- Header copy "Manage dosage adjustments across prescriptions." + New (Plus). `titrations-view.tsx:34-45`.
- Three status groups: Active=`active`, Planned=`draft`, Past=`completed||cancelled`, each only when non-empty; plus Current Maintenance for active rx sorted by `genericName.localeCompare`. `titrations-view.tsx:18-22,60-96`.
- Active card emerald 2px border (`border-emerald-400 ... border-2`); count `phases.length prescription(s)`. `titration-plan-card.tsx:79,98`.
- Plan status color map exactly: active=`bg-emerald-500 text-white`, draft=blue, completed=gray, cancelled=red. `titration-plan-card.tsx:57-64`.
- Inline warnings shown when `isActive || expanded`, amber + `AlertTriangle`. `titration-plan-card.tsx:117-129`.
- Expand: `rotate 180`, height/opacity animation, inner click `stopPropagation`. `titration-plan-card.tsx:108-114,131-140`.
- PhaseEntryRow phase-status badge: active=emerald outline, pending=blue outline, else muted; day subset shown only when `< 7` days. `titration-plan-card.tsx:295-323`.
- Compound dose: `isCombo(rx) ? formatCompoundShort(splitDose(...)) : ${s.dosage}${phase.unit}`. `titration-plan-card.tsx:315-317`; mirrored in `maintenance-row.tsx:20-23`.
- Enums verified digit/member-exact: `TitrationPlanStatus = "draft"|"active"|"completed"|"cancelled"` (`db.ts:193`); `PhaseType = "maintenance"|"titration"` (`db.ts:173`); phase status `"active"|"completed"|"cancelled"|"pending"` (`db.ts:185`); `FoodInstruction = "before"|"after"|"none"` (`db.ts:137`), entry default `"none"` (`titration-service.ts:128`).
- Defaults: new entry schedule `08:00`/all-7-days/empty (`use-titration-drawer-form.ts:60`); added schedule `12:00`/all-7-days/empty (`:75`); `startNow` default `false` (`:50`); startDate default `toLocalDateKey()` (`:8,51`).
- Submit labels: edit pending "Saving...", create pending "Creating...", else `Save Changes` / (startNow ? `Create & Activate` : `Create Plan`). `titration-drawer.tsx:337-343`.
- `canSubmit` = title non-empty AND ≥1 entry AND every entry has prescription + ≥1 schedule + every schedule dosage `parseFloat > 0`. `use-titration-drawer-form.ts:109-118`.
- Dose input `type="number" step="any"` with "mg" suffix; remove-schedule button hidden when `schedules.length <= 1`. `rx-entry-card.tsx:112-122,123`.
- Duplicate-rx prevention via disabled SelectItem `existingRxIds.includes(rx.id) && rx.id !== entry.prescriptionId`. `rx-entry-card.tsx:60`.
- `conditionLabel = firstRx?.indication || title.trim()`. `titration-drawer.tsx:139-142`.
- Start-date NaN guard: only set `recommendedStartDate` when `!startNow && Number.isFinite(parsedStart)`. `titration-drawer.tsx:160-164`.
- Create status logic: `startImmediately` → plan `active` + phases `active`, else `draft`/`pending`; phase startDate immediate=`now`, scheduled=`recommendedStartDate ?? now`. `titration-service.ts:108,127,129`.
- Edit replaces phases/schedules (soft-deletes old, recreates), new phase status `plan.status==="active" ? "active" : "pending"`, startDate `plan.recommendedStartDate ?? now`. `titration-service.ts:238-269,261,263`.
- Dose-log remap old→new phase by `prescriptionId`. `titration-service.ts:251,292-309`.
- Complete & Promote: picks maintenance (prefers `active`, else `[0]` of active/completed), soft-deletes its schedules, copies titration schedules (re-uses `scheduleTimeUTC`), re-activates maintenance, copies `unit` + `foodInstruction`, titration→`completed`+`endDate`. `titration-service.ts:400-468`.
- Cancel: active/pending plan phases → `cancelled`+`endDate`; per affected rx re-activates most-recently-`updatedAt` `completed` maintenance phase. `titration-service.ts:513-546`.
- Delete only for draft/cancelled (UI-gated), soft-deletes plan+phases+schedules. `titration-plan-card.tsx:244`; `titration-service.ts:571-613`.
- `getTitrationPlans` orders `updatedAt` descending and filters `deletedAt === null`. `titration-service.ts:40-43`.
- AI endpoint: `CLAUDE_MODELS.premium`, `max_tokens:1536`, `temperature:0`, forced tool `titration_warnings_result`, `withAuth`, `sanitizeForAI`, `recordUsage`, response `{ warnings: string[] }`, system prompt "clinical pharmacist assistant" / "Aim for 4-8 warnings". `route.ts:55-66,119-127`.
- AI client: frequency `"{N}x daily"`, days "daily" when 7 else comma-joined; warnings appended (newline-joined) to existing; failure swallowed. `titration-drawer.tsx:86-94,119-128`.
- AI Suggest hidden unless `showAi` (`useAuthGate`), disabled when `aiLoading` or zero entries with prescription. `titration-drawer.tsx:294,300`; `auth-guard.tsx:65-68`.
- Empty state: `TrendingUp` muted icon, "No titration plans yet", subtext as quoted. `titrations-view.tsx:48-57`.
- Drawer header "Edit Titration Plan" / "New Titration Plan"; entries-empty dashed hint. `titration-drawer.tsx:199,261-265`.
- Edit prefill timing gated on `phasesReady = editingPhases.length > 0`, then `setInitialized(true)`; resets on close. `titration-drawer.tsx:62-74`.
- `EditPhaseScheduleLoader` returns `null`, loads schedules once (`loaded` flag). `rx-entry-card.tsx:194-221`.
- Prefill panel renders only when active maintenance phase + schedules exist; "Copy to titration" copies times/days/`String(dosage)`. `rx-entry-card.tsx:147-191`.
- `MaintenanceRow` / `PhaseEntryRow` render nothing when no active maintenance phase or no schedules; total daily = sum of schedule dosages, label "/day". `maintenance-row.tsx:11-18,30`.
- All six titration hooks exist with the named mutations. `use-medication-queries.ts:305-357`.

## Low-confidence / could-not-verify

- Doc line 102 "Offline/syncing: no distinct visual state in this unit" — verified there is no offline UI in these components; whole-app sync indicators (if any) live outside this unit and were not exhaustively traced. Believed correct.
- Doc line 171 "failures return 500/502 and the client swallows the error" — route returns 502 (no tool block / validation fail) and 500 (generic catch); `aiErrorResponse` may map provider errors to other codes. Client `try/catch` swallows regardless. The specific 500/502 split is route-accurate but `aiErrorResponse` mappings were not deep-traced.
