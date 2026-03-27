# Phase 12: Composable Data Foundation - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Dexie v15 schema migration adding `groupId` to intakeRecords, eatingRecords, and substanceRecords. New `composable-entry-service.ts` for atomic cross-table writes, reads, and cascading soft-deletes. Standardize intake record deletion to soft-delete. useLiveQuery hooks for reading composable groups. Store original input text on groups for AI re-run capability.

</domain>

<decisions>
## Implementation Decisions

### Individual Record Editing
- **D-01:** Users can freely edit any record within a composable group — the groupId link persists regardless of edits. The group is provenance, not a constraint.
- **D-02:** Two recalculation modes available: (a) re-run AI from stored original input text (full reset of derived values), (b) recalculate math from current record values (e.g., new volume * per-100ml). Both options should be supported by the service layer.
- **D-03:** The composable entry must store the original input text (e.g., "chicken soup") so AI can be re-invoked on an existing group.

### Group Lifecycle
- **D-04:** Group membership is flexible at the data model level — groupId is just a field, any record can reference it. However, no UI or service methods for manual group membership editing are needed now. Groups are created atomically and membership is effectively fixed at creation through normal usage.
- **D-05:** Groups can shrink (individual records can be deleted from a group) — remaining members stay linked.

### Deletion Behavior
- **D-06:** Deleting a record that belongs to a group prompts: "Delete all linked records or just this one?" User chooses scope.
- **D-07:** Standardize all intake record deletion to soft-delete (currently hard-delete in intake-service.ts, but schema already has deletedAt field).
- **D-08:** All deletes (group and individual, within or outside groups) show an undo toast with ~5 second window, matching the existing dose Take/Skip pattern.

### Claude's Discretion
- Exact groupId generation strategy (UUID, nanoid, etc.)
- Dexie v15 index design for groupId queries
- Internal structure of the composable-entry-service API (input types, return types)
- Whether to store group metadata (original input, creation source) as fields on one record or as a lightweight group metadata object
- Undo toast implementation details (reuse existing toast pattern from dose logging)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data Model and Schema
- `.planning/research/ARCHITECTURE.md` — GroupId pattern, Dexie v15 schema design, composable-entry-service code patterns, data flow diagrams
- `.planning/research/PITFALLS.md` — 12 pitfalls including transaction table omission (#1), fetch-inside-transaction (#2), soft/hard delete inconsistency (#3), useLiveQuery split queries (#4)
- `.planning/research/STACK.md` — Dexie.js transaction patterns, zero new dependencies confirmation
- `.planning/research/SUMMARY.md` — Executive summary of all research, build order rationale

### Existing Patterns
- `src/lib/db.ts` — Current schema v14, all table definitions, migration patterns, syncFields() helper
- `src/lib/substance-service.ts` — Soft-delete with cascading pattern (deleteSubstanceRecord), sourceRecordId linking
- `src/lib/intake-service.ts` — Current hard-delete pattern that must be migrated to soft-delete
- `src/lib/dose-log-service.ts` — takeDose/skipDose transaction patterns (best example of multi-table atomic writes with audit)
- `src/hooks/use-intake-queries.ts` — useLiveQuery read pattern, useMutation write pattern
- `src/hooks/use-substance-queries.ts` — useCallback mutation pattern, useLiveQuery with type filter

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db.transaction("rw", [...tables], async () => {...})` — 25+ existing usages, proven pattern for atomic multi-table writes
- `syncFields()` helper — generates createdAt, updatedAt, deletedAt, deviceId, timezone for new records
- `ServiceResult<T>` / `ok()` / `err()` / `unwrap()` — established error handling pattern for all services
- `buildAuditEntry()` — audit logging within transactions
- Existing undo toast in dose logging (immediate action + undo with ~5s window)

### Established Patterns
- `deletedAt: number | null` for soft-delete (null = active, number = deleted timestamp)
- `sourceRecordId` and `source` fields on SubstanceRecord for linking to intake/eating records
- useLiveQuery with default values (`0` for totals, `[]` for arrays) eliminates loading states
- useMutation for writes (React Query), useCallback for simpler mutation hooks
- ESLint no-restricted-imports: components never import from services directly

### Integration Points
- `db.ts` needs v15 version block with groupId indexes on intakeRecords, eatingRecords, substanceRecords
- New `composable-entry-service.ts` in `src/lib/` alongside existing services
- New `use-composable-entry.ts` in `src/hooks/` following useLiveQuery + mutation patterns
- `intake-service.ts` deleteIntakeRecord must switch from hard delete to soft-delete
- Existing substance-service.ts deleteSubstanceRecord already uses correct soft-delete + cascade pattern

</code_context>

<specifics>
## Specific Ideas

- User explicitly wants "type what I ate, and if it has water and salt, it makes an entry in food/salt and liquid intake" — the composable entry service is the enabler for this
- Original input text storage is essential for the "re-run AI" recalculation mode — this is not just metadata, it's a functional requirement
- The group concept should feel lightweight — not a heavy "parent entity" but a shared provenance marker that enables useful operations (cascade delete, recalculate, view as unit)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-composable-data-foundation*
*Context gathered: 2026-03-23*
