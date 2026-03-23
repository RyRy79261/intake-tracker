# Phase 12: Composable Data Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 12-composable-data-foundation
**Areas discussed:** Individual record editing, Group lifecycle, Undo and deletion UX

---

## Individual Record Editing

### Edit behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Edit freely, group stays | User can change any value on any linked record. GroupId link persists regardless. Group is just a provenance marker. | ✓ |
| Edit with recalculation | Editing one record triggers recalculation of related records proportionally | |
| You decide | Claude picks simplest approach | |

**User's choice:** Edit freely, group stays — but with the ability to retrigger calculation
**Notes:** User clarified they want free editing AND the ability to re-run calculations. Not either/or.

### Recalculation mode

| Option | Description | Selected |
|--------|-------------|----------|
| Re-run AI on original input | Store original input text on group. Recalculate replaces all derived values with fresh AI estimates. | |
| Recalc from edited values | Recalculate derived fields from current record values (math only, no AI) | |
| Both options available | User can choose: re-run AI (full reset) or recalculate from current values (math only) | ✓ |

**User's choice:** Both options available
**Notes:** Requires storing the original AI input text on the group for re-run capability.

### Delete one record from group

| Option | Description | Selected |
|--------|-------------|----------|
| Delete just that record | Soft-delete the one record. Remaining group members stay linked. | |
| Prompt: all or just this? | Ask whether to delete the whole group or just this one record | ✓ |
| You decide | Claude picks based on existing app UX patterns | |

**User's choice:** Prompt: all or just this?

---

## Group Lifecycle

### Group growth after creation

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed at creation | Group membership set at creation. Cannot add records to existing group. | |
| Groups can grow | Any record can be added to an existing group later. GroupId assignable at any time. | |
| You decide | Claude picks simplest approach for data model | |

**User's choice:** User clarified: likes the flexibility at the data model level, but can't think of a reason to edit group membership yet. Decision: schema supports it (groupId is just a field), but no UI/service methods for manual membership editing needed now.

---

## Undo and Deletion UX

### Group delete undo toast

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, same pattern | Immediate soft-delete + undo toast with ~5 second window. Matches existing dose logging UX. | ✓ |
| Yes, longer window | Undo toast with 10-15s window since group deletes remove multiple records | |
| You decide | Claude picks based on existing patterns | |

**User's choice:** Yes, same pattern (~5s undo toast)

### Individual record delete undo toast

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, all deletes get undo | Consistent: every delete across the app shows an undo toast | ✓ |
| Only group deletes | Single standalone record deletes stay as-is. Only group operations get the toast. | |
| You decide | Claude picks the right scope | |

**User's choice:** Yes, all deletes get undo — consistent across the board

---

## Claude's Discretion

- GroupId generation strategy
- Dexie v15 index design
- Composable-entry-service API shape
- Group metadata storage approach
- Undo toast implementation details

## Deferred Ideas

None
