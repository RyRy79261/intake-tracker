# Phase 38: Weight Input Default Value Bug - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 38-weight-input-default-value-bug
**Areas discussed:** Default value strategy, Loading UX, First-time user fallback, Query resolution detection, isLoading state fix, Edge case: weight after delete

---

## Default value strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Wait for DB query | Keep pendingWeight as null until useLiveQuery resolves with real data. Remove the 200ms timeout entirely. | ✓ |
| Store last weight in settings | Persist last weight in Zustand/localStorage. Instant default, update when DB loads. | |
| Increase timeout to 2 seconds | Keep current approach with longer delay. Still fragile. | |

**User's choice:** Wait for DB query (Recommended)
**Notes:** None

---

## Loading UX

| Option | Description | Selected |
|--------|-------------|----------|
| Skeleton/shimmer placeholder | Show animated loading placeholder in place of the number. | ✓ |
| Show '--' with disabled controls | Display '--' in weight area, disable buttons. | |
| Show nothing (blank) | Leave display empty until loaded. | |

**User's choice:** Skeleton/shimmer placeholder
**Notes:** User wants to rely on shadcn's Skeleton component as much as possible

---

## First-time user fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 70 kg | Reasonable median starting point. | |
| Use a different value | User-specified default. | ✓ |
| Show empty / force first entry | Show '--' until user types first weight. | |

**User's choice:** Use 69 as a default
**Notes:** User specified 69 kg as the new default value

---

## Query resolution detection

| Option | Description | Selected |
|--------|-------------|----------|
| Use undefined as initial default | Change useLiveQuery default from [] to undefined. undefined = loading, [] = zero records. | ✓ |
| Add a separate isLoaded flag | Track boolean alongside query. More explicit but more state. | |
| You decide | Claude picks best approach. | |

**User's choice:** Use undefined as initial default (Recommended)
**Notes:** None

---

## isLoading state fix

| Option | Description | Selected |
|--------|-------------|----------|
| isLoading = recentRecords === undefined | Simple: loading when query hasn't resolved. Clean and correct. | ✓ |
| You decide | Claude picks simplest correct implementation. | |

**User's choice:** isLoading = recentRecords === undefined (Recommended)
**Notes:** None

---

## Edge case: weight after delete

| Option | Description | Selected |
|--------|-------------|----------|
| Keep the last-shown value | If pendingWeight is already set, keep it. Only use 69 fallback on fresh load with no records. | ✓ |
| Revert to 69 fallback | Reset to new-user default when records become empty. | |
| You decide | Claude picks based on existing patterns. | |

**User's choice:** Keep the last-shown value
**Notes:** None

---

## Claude's Discretion

- Exact skeleton dimensions and placement
- Whether to adjust useWeightRecords signature or create a wrapper
- Test coverage for loading/resolution states

## Deferred Ideas

None — discussion stayed within phase scope.
