# Phase 17: Timezone-Aware Dose Logging - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 17-timezone-aware-dose-logging
**Areas discussed:** Dose time behavior when traveling, Day boundary crossing, Travel detection, Push notification sync

---

## Dose time behavior when traveling

| Option | Description | Selected |
|--------|-------------|----------|
| Keep wall-clock time | 08:00 SA stays 08:00 in Germany. Recalculate scheduleTimeUTC when timezone changes. Matches medical advice. | ✓ |
| Shift with UTC (current behavior) | 08:00 SA becomes 07:00 in Germany (winter). No recalculation needed. Simpler but doses drift. | |
| User chooses per-trip | Prompt on timezone change. Flexible but adds friction. | |

**User's choice:** Keep wall-clock time (Recommended)
**Notes:** Aligns with medical guidance to take meds at the same local time regardless of travel.

### Follow-up: anchorTimezone update

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, update anchorTimezone | anchorTimezone tracks current anchor. Clean — always matches current interpretation. | ✓ |
| Keep original anchorTimezone | Preserves provenance but more complex. | |

**User's choice:** Yes, update anchorTimezone (Recommended)

---

## Day boundary crossing

| Option | Description | Selected |
|--------|-------------|----------|
| Leave logged doses as-is | Already taken/skipped doses keep original timestamps. Only pending doses recalculated. | ✓ |
| Recalculate entire day | Re-derive all slots under new timezone. More consistent but risks display changes for taken doses. | |

**User's choice:** Leave logged doses as-is (Recommended)
**Notes:** What happened already happened — no need to retroactively adjust.

---

## Travel detection

### Detection mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect on app open | Compare device TZ vs stored anchorTimezone. Silently recalculate with toast confirmation. | |
| Auto-detect with confirmation | Detect change, show dialog for user to confirm before recalculation. | ✓ |
| Manual toggle in settings | User explicitly sets timezone. Most control but easy to forget. | |

**User's choice:** Auto-detect with confirmation
**Notes:** Confirmation prevents accidental adjustment during layovers.

### DST vs cross-region

| Option | Description | Selected |
|--------|-------------|----------|
| Only cross-region changes | DST within same IANA TZ handled silently. Only different IANA name triggers dialog. | ✓ |
| All timezone changes | Any UTC offset change triggers dialog, including DST. | |

**User's choice:** Only cross-region changes (Recommended)

### Dismissal behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Don't ask again this session | Dialog won't re-appear until next app open/resume. Good for layovers. | ✓ |
| Ask again next app open | Persistent — keeps asking until accepted. | |
| Never ask again | One-time dismissal permanent for that timezone pair. | |

**User's choice:** Don't ask again this session (Recommended)

---

## Push notification sync

| Option | Description | Selected |
|--------|-------------|----------|
| Re-sync automatically after adjustment | Existing hook re-syncs via hash-based debounce when schedule data changes. Minimal code change. | ✓ |
| Send timezone with schedule data | Include IANA TZ in sync payload for server-side conversion. Requires API changes. | |

**User's choice:** Re-sync automatically after adjustment (Recommended)
**Notes:** Leverages existing usePushScheduleSync hook behavior.

---

## Claude's Discretion

- Dialog design and copy for timezone change confirmation
- Cache invalidation approach for getDeviceTimezone()
- Whether to show toast after silent DST adjustment
- Test strategy for simulating timezone transitions

## Deferred Ideas

- Per-prescription timezone override
- Timezone history/audit trail
- Server-side timezone handling for push notifications
