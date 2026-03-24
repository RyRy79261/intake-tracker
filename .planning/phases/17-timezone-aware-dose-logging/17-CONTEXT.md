# Phase 17: Timezone-Aware Dose Logging - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Dose schedule generation produces correct day-of-week schedules when the user travels between South Africa (UTC+2) and Germany (UTC+1/+2 DST). Wall-clock dose times are preserved across timezone changes. Each dose log records the device timezone at time of logging. The app detects timezone changes on open and prompts the user to confirm schedule adjustment.

</domain>

<decisions>
## Implementation Decisions

### Dose time behavior when traveling
- **D-01:** Wall-clock times are preserved when traveling. If a dose is set for 08:00, it stays 08:00 regardless of timezone. The app recalculates `scheduleTimeUTC` values to maintain the same local time in the new timezone.
- **D-02:** `anchorTimezone` on PhaseSchedule records is updated to reflect the new timezone after recalculation. It always matches the current interpretation of the schedule.

### Day boundary crossing
- **D-03:** On the transition day, already-logged doses (taken/skipped) are left as-is with their original timestamps and timezone. Only pending (future) doses for that day get recalculated to the new timezone.

### Travel detection mechanism
- **D-04:** Auto-detect timezone change on app open/resume by comparing device IANA timezone name against the stored `anchorTimezone` on active schedules.
- **D-05:** Show a confirmation dialog when a cross-region timezone change is detected (different IANA timezone name, e.g., Africa/Johannesburg -> Europe/Berlin). User confirms before schedules are recalculated.
- **D-06:** DST transitions within the same IANA timezone (e.g., Europe/Berlin CET->CEST) are handled silently — no dialog. The UTC offset changes but the Intl API handles this automatically since `scheduleTimeUTC` is recalculated from the same IANA name.
- **D-07:** If the user dismisses the timezone adjustment dialog, schedules stay on the old timezone and the dialog won't re-appear until the next app open/resume.

### Push notification sync
- **D-08:** After the user confirms timezone adjustment, the schedule recalculation triggers the existing `usePushScheduleSync` hook to re-sync automatically. The hash-based debounce ensures it only pushes when data actually changes. No server-side API changes needed.

### Claude's Discretion
- Dialog design and copy for the timezone change confirmation
- How to clear the cached timezone in `getDeviceTimezone()` on app resume
- Whether to show a toast after silent DST adjustment
- Test strategy for simulating timezone transitions

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Timezone infrastructure
- `src/lib/timezone.ts` — UTC<->local conversion, `getDeviceTimezone()`, `localTimeToUTCMinutes()`, `utcMinutesToLocalTime()`, `formatLocalTime()`, migration helpers
- `src/lib/db.ts` (PhaseSchedule interface, ~line 188) — `scheduleTimeUTC`, `anchorTimezone`, `daysOfWeek` fields
- `src/lib/db.ts` (DoseLog interface, ~line 255) — `timezone` field already present on dose logs

### Dose schedule generation
- `src/lib/dose-schedule-service.ts` — `getDailyDoseSchedule()` derives daily dose slots from active prescriptions/phases/schedules. Core function that needs timezone-aware day-of-week handling.
- `src/lib/dose-log-service.ts` — `upsertDoseLog()` already stores `timezone: getDeviceTimezone()` on every log. `takeDose()`, `skipDose()`, `untakeDose()` mutation functions.

### Push notifications
- `src/hooks/use-push-schedule-sync.ts` — Syncs dose schedule to server for push notifications. Hash-based debounce. Will auto-re-sync when schedule data changes.

### Schedule management
- `src/lib/medication-schedule-service.ts` — CRUD for PhaseSchedule records, uses `localHHMMStringToUTCMinutes()` for time conversion

### Tests
- `src/lib/dose-schedule-service.test.ts` — Existing tests for dose schedule generation
- `src/lib/dose-log-service.test.ts` — Existing tests for dose log mutations

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `timezone.ts`: Full UTC<->local conversion suite already built. `getDeviceTimezone()` is cached — needs cache-busting on app resume for travel detection.
- `PhaseSchedule.anchorTimezone`: Already stored per schedule — the comparison target for detecting timezone changes.
- `DoseLog.timezone`: Already written on every dose log via `syncFields()` and `upsertDoseLog()` — success criterion #2 is already met.
- `usePushScheduleSync`: Hash-based debounce auto-detects schedule changes — will re-sync after recalculation without code changes.

### Established Patterns
- `useLiveQuery` for all reads — schedule recalculation will auto-propagate to UI
- `db.transaction()` for atomic multi-table writes — use for bulk schedule recalculation
- Settings store (Zustand) for UI state — can store "last seen timezone" for session-level dismissal tracking
- `syncFields()` provides timezone, deviceId, timestamps on all records

### Integration Points
- `getDailyDoseSchedule()` — needs timezone-aware daysOfWeek filtering (core fix)
- `getDeviceTimezone()` — needs cache invalidation on app resume
- New: timezone change detection hook (runs on app open/resume)
- New: confirmation dialog component for timezone adjustment
- New: bulk schedule recalculation function (update `scheduleTimeUTC` + `anchorTimezone` for all active schedules)

</code_context>

<specifics>
## Specific Ideas

- User travels between SA and Germany regularly — the 0-1 hour offset means most schedules won't cross day boundaries, but the solution must handle edge cases correctly
- Confirmation dialog prevents accidental adjustment during layovers or brief timezone changes
- Session-level dismissal (don't ask again until next app open) balances between persistence and respecting user choice

</specifics>

<deferred>
## Deferred Ideas

- Per-prescription timezone override (some meds might need absolute-time dosing for medical reasons) — future if needed
- Timezone history/audit trail (which timezone each schedule was anchored to over time) — anchorTimezone update is sufficient for now
- Server-side timezone handling for push notifications — current client-side re-sync approach is sufficient

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-timezone-aware-dose-logging*
*Context gathered: 2026-03-24*
