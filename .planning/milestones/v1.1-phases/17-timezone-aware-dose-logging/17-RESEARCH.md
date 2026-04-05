# Phase 17: Timezone-Aware Dose Logging - Research

**Researched:** 2026-03-25
**Domain:** Timezone-aware schedule management, Intl API, client-side date/time handling
**Confidence:** HIGH

## Summary

Phase 17 is a focused service-layer and hook-level phase. Most infrastructure already exists: `timezone.ts` has UTC<->local conversion, `PhaseSchedule.anchorTimezone` stores the timezone per schedule, `DoseLog.timezone` is already written on every log via `syncFields()` and `upsertDoseLog()`. The core work is: (1) fixing `getDailyDoseSchedule()` to use timezone-aware day-of-week filtering, (2) adding cache-busting for `getDeviceTimezone()` on app resume, (3) building a timezone change detection hook that runs on visibility change, (4) building a bulk schedule recalculation service function, and (5) adding the `TimezoneChangeDialog` component.

No external libraries are needed. The browser `Intl.DateTimeFormat` API handles all timezone resolution. The existing `visibilitychange` DOM event handles app resume detection. All UI components needed (AlertDialog, Button, Toast) are already installed.

**Primary recommendation:** This is an infrastructure-plus-one-dialog phase. The service layer changes (timezone-aware day-of-week, bulk recalculation, cache busting) should be built and tested first, then the detection hook + dialog layered on top.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Wall-clock times are preserved when traveling. If a dose is set for 08:00, it stays 08:00 regardless of timezone. The app recalculates `scheduleTimeUTC` values to maintain the same local time in the new timezone.
- **D-02:** `anchorTimezone` on PhaseSchedule records is updated to reflect the new timezone after recalculation. It always matches the current interpretation of the schedule.
- **D-03:** On the transition day, already-logged doses (taken/skipped) are left as-is with their original timestamps and timezone. Only pending (future) doses for that day get recalculated to the new timezone.
- **D-04:** Auto-detect timezone change on app open/resume by comparing device IANA timezone name against the stored `anchorTimezone` on active schedules.
- **D-05:** Show a confirmation dialog when a cross-region timezone change is detected (different IANA timezone name, e.g., Africa/Johannesburg -> Europe/Berlin). User confirms before schedules are recalculated.
- **D-06:** DST transitions within the same IANA timezone (e.g., Europe/Berlin CET->CEST) are handled silently -- no dialog. The UTC offset changes but the Intl API handles this automatically since `scheduleTimeUTC` is recalculated from the same IANA name.
- **D-07:** If the user dismisses the timezone adjustment dialog, schedules stay on the old timezone and the dialog won't re-appear until the next app open/resume.
- **D-08:** After the user confirms timezone adjustment, the schedule recalculation triggers the existing `usePushScheduleSync` hook to re-sync automatically. The hash-based debounce ensures it only pushes when data actually changes. No server-side API changes needed.

### Claude's Discretion
- Dialog design and copy for the timezone change confirmation
- How to clear the cached timezone in `getDeviceTimezone()` on app resume
- Whether to show a toast after silent DST adjustment
- Test strategy for simulating timezone transitions

### Deferred Ideas (OUT OF SCOPE)
- Per-prescription timezone override (some meds might need absolute-time dosing for medical reasons) -- future if needed
- Timezone history/audit trail (which timezone each schedule was anchored to over time) -- anchorTimezone update is sufficient for now
- Server-side timezone handling for push notifications -- current client-side re-sync approach is sufficient
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TMZN-01 | Dose log generation produces correct day-of-week schedules for both SA (UTC+2) and Germany (UTC+1/+2 DST) timezones, with device timezone stored per dose log | Service-layer fix to `getDailyDoseSchedule()` day-of-week calculation, bulk recalculation function, timezone detection hook + dialog. DoseLog.timezone already written via `syncFields()`/`upsertDoseLog()` -- success criterion #2 is already satisfied. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Intl.DateTimeFormat | Browser built-in | IANA timezone detection and UTC offset calculation | Zero dependencies, already used in `timezone.ts`, reliable cross-browser |
| Dexie.js | Already installed (v4) | IndexedDB ORM for schedule reads/writes | Existing data layer, `useLiveQuery` auto-propagates changes |
| Zustand | Already installed | Session-level state (timezone dismissal flag) | Existing state management, non-persisted state for session flags |
| shadcn AlertDialog | Already installed | Timezone change confirmation dialog | Already used in `titrations-view.tsx`, follows project patterns |
| lucide-react | Already installed | Globe icon for dialog | Already used throughout codebase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @/hooks/use-toast | Already installed | Success/DST info toasts | After schedule adjustment confirmation and silent DST transitions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Intl API for timezone detection | `luxon` or `date-fns-tz` | Overkill -- Intl API is already used and sufficient for this use case |
| `visibilitychange` event | `focus` event | `visibilitychange` fires more reliably on mobile PWAs when app resumes from background |
| Module-level variable for dismissal | Zustand non-persisted state | Module-level variable is simpler and matches the "session-level" semantics exactly (cleared on page reload) |

**Installation:**
No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── timezone.ts                    # Extended: clearTimezoneCache(), recalculateScheduleTimezones()
│   ├── dose-schedule-service.ts       # Modified: timezone-aware day-of-week in getDailyDoseSchedule()
│   └── dose-schedule-service.test.ts  # Extended: timezone transition tests
├── hooks/
│   └── use-timezone-detection.ts      # NEW: timezone change detection hook
├── components/
│   └── medications/
│       └── timezone-change-dialog.tsx # NEW: confirmation dialog
└── app/
    └── providers.tsx                  # Modified: mount useTimezoneDetection
```

### Pattern 1: Timezone-Aware Day-of-Week Calculation
**What:** The current `getDailyDoseSchedule()` uses `new Date(dateStr + "T12:00:00").getDay()` which calculates day-of-week in the **JavaScript runtime's local timezone**. Since this app runs in the browser, the runtime timezone matches the device timezone, which is also the user's intended timezone. However, using `T12:00:00` without an explicit timezone specifier means the date is interpreted in the browser's local time. This is actually correct for the use case -- the user asking "what are my doses for 2026-03-25" means "March 25 in my local timezone."
**When to use:** Always when determining which day-of-week a date string falls on for schedule filtering.
**Key insight:** The date string parsing is NOT the bug. The actual problem this phase solves is: when the user travels, the `scheduleTimeUTC` values on their PhaseSchedule records still reflect the old timezone's offset calculation. D-01 says wall-clock times must be preserved, so after travel, `scheduleTimeUTC` must be recalculated using the new timezone's offset.

```typescript
// Current (correct for day-of-week):
const parsedDate = new Date(dateStr + "T12:00:00");
const dayOfWeek = parsedDate.getDay(); // Uses browser local tz -- correct

// The fix needed is NOT here. It's in schedule recalculation.
```

### Pattern 2: Bulk Schedule Recalculation
**What:** When the user confirms a timezone change, all active PhaseSchedule records need their `scheduleTimeUTC` recalculated. The wall-clock time is derived from the old `scheduleTimeUTC` + old `anchorTimezone`, then re-encoded for the new timezone.
**When to use:** After user confirms timezone change dialog.
**Example:**
```typescript
// Source: D-01, D-02 from CONTEXT.md
async function recalculateScheduleTimezones(
  newTimezone: string
): Promise<void> {
  await db.transaction("rw", [db.phaseSchedules, db.auditLogs], async () => {
    const allSchedules = await db.phaseSchedules.toArray();
    const activeSchedules = allSchedules.filter(s => s.enabled === true);

    for (const schedule of activeSchedules) {
      if (schedule.anchorTimezone === newTimezone) continue; // Already correct

      // Step 1: Convert stored UTC minutes back to local HH:MM using OLD timezone
      const { hours, minutes } = utcMinutesToLocalTime(
        schedule.scheduleTimeUTC,
        schedule.anchorTimezone
      );

      // Step 2: Convert that same local HH:MM to UTC minutes using NEW timezone
      const newUTC = localTimeToUTCMinutes(hours, minutes, newTimezone);

      // Step 3: Update the schedule
      await db.phaseSchedules.update(schedule.id, {
        scheduleTimeUTC: newUTC,
        anchorTimezone: newTimezone,
        time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
        updatedAt: Date.now(),
      });
    }

    await db.auditLogs.add(buildAuditEntry("timezone_adjusted", { newTimezone }));
  });
}
```

### Pattern 3: Cache-Busting for getDeviceTimezone()
**What:** `getDeviceTimezone()` in `timezone.ts` caches the IANA timezone in a module-level variable `_cachedTimezone`. After travel, this cache must be invalidated so subsequent calls return the new timezone.
**When to use:** On app resume (visibilitychange event) before timezone comparison.
**Example:**
```typescript
// Add to timezone.ts
export function clearTimezoneCache(): void {
  _cachedTimezone = null;
}
```

### Pattern 4: Visibility Change Detection (App Resume)
**What:** Use the `visibilitychange` DOM event to detect when the app returns from background. This is the standard PWA approach for mobile apps.
**When to use:** For triggering timezone change detection on app open/resume.
**Example:**
```typescript
// In useTimezoneDetection hook
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      clearTimezoneCache();
      checkTimezoneChange();
    }
  };

  // Check on mount (app open)
  checkTimezoneChange();

  // Check on resume from background
  document.addEventListener("visibilitychange", handleVisibilityChange);
  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}, []);
```

### Pattern 5: Session-Level Dismissal Flag
**What:** Use a module-level variable (not Zustand persisted state) to track whether the user dismissed the timezone dialog in this session. This naturally resets on page reload/app restart.
**When to use:** To prevent re-prompting after the user taps "Not Now" (D-07).
**Example:**
```typescript
// In use-timezone-detection.ts
let _dismissedThisSession = false;

export function useTimezoneDetection() {
  // ...
  const checkTimezoneChange = useCallback(() => {
    if (_dismissedThisSession) return;
    // ... detection logic
  }, []);

  const handleDismiss = useCallback(() => {
    _dismissedThisSession = true;
    setDialogOpen(false);
  }, []);

  // ... return dialog state
}
```

### Anti-Patterns to Avoid
- **Don't use `new Date()` without timezone context for time calculations:** Always use the `timezone.ts` conversion functions to go between local and UTC time.
- **Don't parse timezone offsets manually:** Use `getTimezoneOffsetMinutes()` from `timezone.ts` which handles DST correctly via Intl API.
- **Don't store the timezone dismissal in localStorage/Zustand persisted:** It should reset on app restart so the user gets re-prompted on next app launch.
- **Don't modify dose logs during timezone recalculation:** D-03 explicitly says already-logged doses stay as-is. Only PhaseSchedule records get updated.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IANA timezone detection | Manual offset parsing or navigator.language tricks | `Intl.DateTimeFormat().resolvedOptions().timeZone` | Reliable across all modern browsers, returns proper IANA string |
| UTC offset calculation | `Date.getTimezoneOffset()` with manual DST logic | `getTimezoneOffsetMinutes()` from `timezone.ts` | Already implemented, handles DST via locale-string diff trick |
| Dialog component | Custom modal with backdrop | shadcn `AlertDialog` | Already installed, accessible, focus-trapped, keyboard-navigable |
| Toast notifications | Custom notification component | `toast()` from `@/hooks/use-toast` | Already used in 27+ components across the app |

**Key insight:** All the building blocks exist. This phase is about wiring them together, not building new primitives.

## Common Pitfalls

### Pitfall 1: Stale Timezone Cache
**What goes wrong:** `getDeviceTimezone()` caches the IANA timezone at first call. If the user travels and the app is still in memory, subsequent calls return the old timezone.
**Why it happens:** Module-level `_cachedTimezone` variable is set once and never cleared.
**How to avoid:** Call `clearTimezoneCache()` before every timezone comparison on app resume.
**Warning signs:** Timezone dialog never appears despite device timezone changing.

### Pitfall 2: DST Offset Confusion Between SA and Germany
**What goes wrong:** In European summer (CEST), both Africa/Johannesburg and Europe/Berlin are UTC+2. The offset difference is 0, but the IANA names differ. If detection uses offset comparison, travel between SA and Germany in summer would be missed.
**Why it happens:** Comparing numeric offsets instead of IANA timezone strings.
**How to avoid:** D-05 specifies comparison by IANA timezone name, not offset. `"Africa/Johannesburg" !== "Europe/Berlin"` is always true regardless of DST state.
**Warning signs:** Tests pass in winter but fail in summer (or vice versa).

### Pitfall 3: Race Condition Between Schedule Recalculation and useLiveQuery
**What goes wrong:** If `recalculateScheduleTimezones()` writes to `db.phaseSchedules` while `useLiveQuery` is mid-read, the UI could show partially-updated schedules.
**Why it happens:** Dexie writes are atomic per-record, not per-batch, unless wrapped in a transaction.
**How to avoid:** Wrap all schedule updates in a single `db.transaction()` call. This is already the recommended pattern (per SRVC-01).
**Warning signs:** Dose slots flicker or show incorrect times briefly after timezone adjustment.

### Pitfall 4: getTimezoneOffsetMinutes Uses "Right Now" Offset
**What goes wrong:** `getTimezoneOffsetMinutes(timezone)` calculates the offset for the **current instant**, not for a specific date. During DST transitions, the offset may be different for past/future dates.
**Why it happens:** The function uses `new Date()` internally.
**How to avoid:** For schedule recalculation, this is actually correct -- we want the **current** offset because we're adjusting schedules for "right now" (the timezone the user is currently in). For retrospective display of historical dose logs, the stored `timezone` field on each log preserves the original context.
**Warning signs:** No action needed -- the current behavior is correct for this use case.

### Pitfall 5: Test Environment Timezone Leakage
**What goes wrong:** Unit tests that mock timezone behavior may be affected by the actual timezone of the CI/dev machine.
**Why it happens:** `Intl.DateTimeFormat()` returns the machine's actual timezone, and Node.js respects the `TZ` environment variable.
**How to avoid:** Always pass explicit timezone parameters to `getDailyDoseSchedule()` in tests (already done in existing tests). For timezone detection tests, mock `Intl.DateTimeFormat` or use the `TZ` environment variable.
**Warning signs:** Tests pass locally but fail in CI, or vice versa.

### Pitfall 6: Updating the Deprecated `time` Field
**What goes wrong:** PhaseSchedule has a deprecated `time` field (string "HH:MM") kept for backward compatibility. If `scheduleTimeUTC` is updated but `time` is not, queries that still use `time` (e.g., `getDailySchedule` in `medication-schedule-service.ts` uses `schedule.time` for grouping) will show stale times.
**Why it happens:** `time` is a legacy field that predates the UTC-based storage.
**How to avoid:** When recalculating `scheduleTimeUTC`, also update the `time` field to the new local HH:MM string.
**Warning signs:** Schedule management view shows old times while dose schedule shows correct new times.

## Code Examples

Verified patterns from the existing codebase:

### Existing: How schedules are created with timezone
```typescript
// Source: src/lib/medication-schedule-service.ts, addSchedule()
const tz = getDeviceTimezone();
const schedule: PhaseSchedule = {
  ...input,
  id: crypto.randomUUID(),
  enabled: true,
  scheduleTimeUTC: localHHMMStringToUTCMinutes(input.time, tz),
  anchorTimezone: tz,
  ...syncFields(),
};
```

### Existing: How dose logs store timezone
```typescript
// Source: src/lib/dose-log-service.ts, upsertDoseLog()
const timezone = getDeviceTimezone();
if (existing) {
  const updates: Partial<DoseLog> = {
    status,
    actionTimestamp: now,
    timezone,  // <-- Always stores current device timezone
    updatedAt: now,
    ...extra,
  };
  await db.doseLogs.update(existing.id, updates);
}
```

### Existing: How UTC<->local conversion works
```typescript
// Source: src/lib/timezone.ts
// local = UTC + offset  =>  UTC = local - offset
const result = localMinutes - offsetMinutes;
return ((result % 1440) + 1440) % 1440; // Wraps around midnight
```

### Existing: AlertDialog usage pattern
```typescript
// Source: src/components/medications/titrations-view.tsx (only existing AlertDialog user)
// The pattern follows standard shadcn AlertDialog with AlertDialogTrigger/Content/Header/Footer
```

### Existing: How the medications schedule-view uses useDailyDoseSchedule
```typescript
// Source: src/hooks/use-medication-queries.ts
export function useDailyDoseSchedule(dateStr: string) {
  return useLiveQuery(() => getDailyDoseSchedule(dateStr), [dateStr]);
}
// useLiveQuery auto-re-runs when phaseSchedules table changes
// So after recalculation, the UI updates automatically
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Date.getTimezoneOffset()` | `Intl.DateTimeFormat().resolvedOptions().timeZone` | Broadly supported since 2020+ | Returns IANA string instead of numeric offset, handles DST automatically |
| External tz libraries (moment-timezone) | Browser Intl API | moment-timezone deprecated 2020 | No bundle size cost, always current IANA database from OS |
| `pageshow`/`focus` events for app resume | `visibilitychange` event | Page Visibility API W3C Rec 2013 | More reliable on mobile PWAs, specifically designed for app lifecycle |

**Deprecated/outdated:**
- `moment-timezone`: Deprecated in favor of Intl API + `Temporal` proposal
- `Date.getTimezoneOffset()`: Returns numeric offset only, no IANA name, no DST-aware calculations

## Open Questions

1. **Where to mount `useTimezoneDetection`**
   - What we know: The hook needs to run at app root level. `providers.tsx` is the logical location, but it's a provider stack, not a component that renders hooks directly. The hook could be mounted in a wrapper component within providers.
   - What's unclear: Whether to add it to `providers.tsx` directly or create a small wrapper component.
   - Recommendation: Create a small `<TimezoneGuard>` wrapper component that renders children and mounts the hook internally. Place it inside the provider stack at an appropriate level (inside QueryClientProvider since it may need toast access, but outside PinGateProvider since timezone detection should work even if PIN is locked).

2. **DST silent toast: show or not?**
   - What we know: D-06 says DST transitions within the same IANA timezone are handled silently. The context notes this as Claude's discretion.
   - What's unclear: Whether a toast is helpful or noisy for DST transitions.
   - Recommendation: Show a brief info toast ("Clock adjusted for daylight saving time") per the UI-SPEC. It's a once-per-DST-transition event (twice per year), so noise is minimal and it provides useful confirmation.

3. **Test strategy for timezone simulation**
   - What we know: Existing tests pass explicit timezone parameters. The `TZ` environment variable controls Node.js timezone behavior.
   - What's unclear: Best way to test the detection hook and dialog flow.
   - Recommendation: For service-layer tests, pass explicit timezone parameters (already the pattern). For the detection hook, use vitest's `vi.mock()` to mock `Intl.DateTimeFormat` and `getDeviceTimezone()`. For E2E, this is impractical to test -- rely on unit tests.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm vitest run src/lib/dose-schedule-service.test.ts` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TMZN-01a | getDailyDoseSchedule produces correct slots after timezone change | unit | `pnpm vitest run src/lib/dose-schedule-service.test.ts -t "timezone"` | Partially -- existing timezone tests cover static behavior; new tests needed for recalculation |
| TMZN-01b | Bulk schedule recalculation preserves wall-clock times | unit | `pnpm vitest run src/lib/timezone.test.ts -t "recalculate"` | No -- needs new test file or extension |
| TMZN-01c | Device timezone stored per dose log | unit | `pnpm vitest run src/lib/dose-log-service.test.ts -t "timezone"` | No explicit test, but behavior verified by existing code paths |
| TMZN-01d | Timezone detection hook detects cross-region changes | unit | `pnpm vitest run src/hooks/use-timezone-detection.test.ts` | No -- new file needed |
| TMZN-01e | Schedule recalculation does not affect already-logged doses | unit | `pnpm vitest run src/lib/dose-schedule-service.test.ts -t "transition"` | No -- new test needed |

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/lib/dose-schedule-service.test.ts src/lib/dose-log-service.test.ts`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/dose-schedule-service.test.ts` -- new tests for: timezone recalculation correctness, transition-day behavior (D-03), no duplication/dropping of slots
- [ ] `src/lib/timezone.test.ts` -- new file: `clearTimezoneCache()` behavior, `recalculateScheduleTimezones()` correctness with SA/Germany offsets
- [ ] No framework install needed -- Vitest 4.0.18 already configured with fake-indexeddb

## Sources

### Primary (HIGH confidence)
- `src/lib/timezone.ts` -- Full review of existing UTC conversion utilities
- `src/lib/dose-schedule-service.ts` -- Full review of `getDailyDoseSchedule()` logic
- `src/lib/dose-log-service.ts` -- Full review of `upsertDoseLog()` timezone handling
- `src/lib/medication-schedule-service.ts` -- Full review of schedule CRUD with timezone
- `src/lib/db.ts` -- PhaseSchedule and DoseLog interfaces (lines 188-273)
- `src/hooks/use-push-schedule-sync.ts` -- Hash-based debounce auto-re-sync pattern
- `src/__tests__/fixtures/db-fixtures.ts` -- Test fixture patterns
- `src/lib/dose-schedule-service.test.ts` -- Existing timezone test patterns
- MDN Web Docs -- `Intl.DateTimeFormat` and `visibilitychange` API (verified via Node.js runtime)
- `.planning/phases/17-timezone-aware-dose-logging/17-CONTEXT.md` -- Locked decisions D-01 through D-08
- `.planning/phases/17-timezone-aware-dose-logging/17-UI-SPEC.md` -- Approved dialog design contract

### Secondary (MEDIUM confidence)
- Runtime verification of SA/Germany offset behavior via Node.js (confirmed SA=+120, Berlin=+60 in winter)

### Tertiary (LOW confidence)
- None

## Project Constraints (from CLAUDE.md)

- Package manager: **pnpm** (npm/yarn will fail)
- Data layer: **Dexie.js** in IndexedDB, no server-side DB for user data
- State: **Zustand** for settings, **React Query / useLiveQuery** for data, **React Context** for auth
- UI: **shadcn/ui** components, **Tailwind CSS**, **Outfit** font
- Testing: **Vitest** unit tests, **Playwright** E2E
- Path alias: `@/*` -> `src/*`
- ESLint: no-restricted-imports enforces service boundary (components never import from services)
- All multi-table writes: wrapped in `db.transaction()` (SRVC-01)
- Schema version: currently at 14 (no schema changes needed for this phase)
- Conditional spread for `exactOptionalPropertyTypes` compliance
- `useLiveQuery` for ALL reads, `useMutation` for writes

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already installed, no new packages needed
- Architecture: HIGH -- patterns directly observable in existing codebase, clear mapping to decisions
- Pitfalls: HIGH -- verified via code review and runtime testing of timezone behavior

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable domain -- browser Intl API is not changing)
