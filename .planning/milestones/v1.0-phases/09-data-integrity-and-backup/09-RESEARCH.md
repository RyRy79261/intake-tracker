# Phase 09: Data Integrity and Backup - Research

**Researched:** 2026-03-21
**Domain:** IndexedDB backup/restore, merge conflict detection, audit trail completeness
**Confidence:** HIGH

## Summary

This phase extends an already well-structured backup system (`backup-service.ts`) to include 9 additional medication/system tables, changes the restore logic from simple skip-on-ID-match to a merge-with-collision-review flow, and verifies audit trail completeness across all medication mutation paths.

The existing code has clear, repetitive patterns for export (Promise.all with `.toArray()`), import (validate per record, check existing IDs, `bulkPut`), and audit logging (`buildAuditEntry` inside `db.transaction`). The new work is additive -- extending these patterns to more tables and adding conflict detection logic. The collision review UI is the only net-new UI component.

**Primary recommendation:** Extend the existing backup-service.ts patterns table-by-table, add a `conflicts` array to ImportResult for deferred resolution, and build the collision review as a lightweight Drawer component in the data-management-section.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Add ALL remaining user data tables to backup: prescriptions, medicationPhases, phaseSchedules, inventoryItems, inventoryTransactions, doseLogs, titrationPlans, dailyNotes, auditLogs
- Bump CURRENT_BACKUP_VERSION to 5
- Default restore mode is MERGE (not wipe-and-replace)
- Import new records (by ID) that don't exist locally
- Skip exact duplicates silently
- Detect conflicts: records with same ID but different content
- After import: show summary -- "Imported: N new, M skipped, K conflicts"
- "Review K conflicts?" button opens a list where user picks keep-current or use-backup per conflict
- "Skip review" keeps existing data for all conflicts
- Confirmation warning before starting restore
- Verify every medication mutation path has a buildAuditEntry call
- Fill any gaps found (e.g., titration plan create/update/delete, interaction check)
- No audit viewer UI -- backend-only for now

### Claude's Discretion
- Exact collision comparison logic (deep equality vs field-by-field)
- How to display conflict diffs in the review UI (side-by-side, inline, etc.)
- Whether to batch conflict resolution ("keep all current" / "use all backup" buttons)
- Migration handling for restoring v4 backups into v5 schema (add missing fields with defaults)

### Deferred Ideas (OUT OF SCOPE)
- Audit log viewer UI -- future phase
- Automatic scheduled backups -- separate capability
- Cloud sync -- out of scope for this milestone
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | Backup/export includes all tables -- prescriptions, phases, inventory, dose logs, daily notes | Extend BackupData interface with 9 new optional array fields, extend exportBackup with Promise.all for all tables |
| DATA-02 | Backup round-trip test -- export, clear, import, verify all data | Vitest + fake-indexeddb infrastructure exists (src/__tests__/setup.ts); write round-trip test for all 16 tables |
| DATA-03 | Audit logging for all medication operations | Audit coverage analysis below identifies specific gaps to fill |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Dexie.js | 4.x (already installed) | IndexedDB ORM -- all data operations | Project standard, all tables defined |
| Vitest | (already installed) | Unit testing for round-trip verification | Project standard, fake-indexeddb setup exists |
| fake-indexeddb | (already installed) | IndexedDB mock for Node.js tests | Already in setup.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui Drawer | (already installed) | Collision review overlay | Mobile-friendly bottom sheet for conflict list |
| lucide-react | (already installed) | Icons for conflict UI | AlertTriangle, Check, X icons |

No new dependencies needed. Everything required is already in the project.

## Architecture Patterns

### Existing Export Pattern (extend for new tables)
```typescript
// backup-service.ts -- exportBackup() uses Promise.all with .toArray()
const [existing..., prescriptions, medicationPhases, ...] = await Promise.all([
  ...existingCalls,
  db.prescriptions.toArray(),
  db.medicationPhases.toArray(),
  // ... 9 more tables
]);
```

### Existing Import Pattern (extend with conflict detection)
Current merge: skip if ID exists. New merge: compare content when ID exists.

```typescript
// For each table during merge import:
// 1. Get existing record by ID
// 2. If not found -> new record, add to import batch
// 3. If found and identical -> skip silently
// 4. If found and different -> add to conflicts array

interface ConflictRecord {
  table: string;
  id: string;
  current: Record<string, unknown>;
  backup: Record<string, unknown>;
}
```

### Collision Comparison Strategy (Claude's Discretion)
**Recommendation: Shallow field equality ignoring sync metadata.**

Compare all fields EXCEPT: `createdAt`, `updatedAt`, `deletedAt`, `deviceId`, `timezone`. These fields are sync/metadata and should not trigger a conflict -- only user-meaningful data differences matter.

```typescript
function isContentEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const IGNORE_FIELDS = new Set(["createdAt", "updatedAt", "deletedAt", "deviceId", "timezone"]);
  const aKeys = Object.keys(a).filter(k => !IGNORE_FIELDS.has(k));
  const bKeys = Object.keys(b).filter(k => !IGNORE_FIELDS.has(k));
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}
```

**Why not deep equality:** Sync fields like `updatedAt` will almost always differ between devices/exports, creating false conflicts on every record.

### Conflict Review UI (Claude's Discretion)
**Recommendation: Drawer with summary list + batch buttons.**

- Drawer opens from bottom (mobile-first, consistent with existing patterns)
- Header: "K conflicts found" with "Keep All Current" and "Use All Backup" batch buttons
- List: one row per conflict showing table name, record ID, and a brief diff summary
- Per-row: "Keep" / "Use Backup" toggle buttons
- Footer: "Apply" button to resolve all decisions

### Import Result Extension
```typescript
export interface ImportResult {
  success: boolean;
  // ... existing count fields ...
  prescriptionsImported: number;
  phasesImported: number;
  schedulesImported: number;
  inventoryItemsImported: number;
  inventoryTransactionsImported: number;
  doseLogsImported: number;
  titrationPlansImported: number;
  dailyNotesImported: number;
  auditLogsImported: number;
  skipped: number;
  conflicts: ConflictRecord[];
  errors: string[];
}
```

### V4 Backup Migration (Claude's Discretion)
**Recommendation: Optional fields with graceful defaults.**

New table arrays in BackupData are already optional (undefined). When importing a v4 backup, missing fields default to empty arrays. No explicit migration function needed -- the existing pattern of `data.tableName || []` handles it.

The `replace` mode in import must also clear the new tables when replacing.

### Anti-Patterns to Avoid
- **Don't use `bulkPut` for conflict records:** Conflicts should be surfaced to the user, not silently overwritten. Only `bulkPut` after user resolves conflicts.
- **Don't compare stringified entire objects:** Sync metadata differences would create false conflicts on every record.
- **Don't load all records into memory for large tables:** Use `.primaryKeys()` first to check existence, then `.get(id)` only for records that match an ID in the backup.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deep object comparison | Custom recursive differ | `JSON.stringify` per field (after filtering sync fields) | Records are flat objects with simple values; no nested structures need deep comparison |
| Drawer/modal UI | Custom overlay component | shadcn/ui Drawer (already installed) | Consistent with app patterns, mobile-friendly |
| Record validation | Type-only checks | Existing validator functions (isValidIntakeRecord, etc.) | Pattern already established, extend for new tables |

## Audit Trail Coverage Analysis

### Current Coverage (verified via grep)

| Service | Function | Audit Action | Status |
|---------|----------|-------------|--------|
| medication-service | addPrescription | prescription_added | COVERED |
| medication-service | updatePrescription | prescription_updated | COVERED |
| medication-service | updatePrescriptionFields | prescription_updated | COVERED |
| medication-service | deletePrescription | prescription_deleted | COVERED |
| medication-service | addInventoryItem | inventory_added | COVERED |
| medication-service | updateInventoryItem | inventory_adjusted | COVERED |
| medication-service | deleteInventoryItem | inventory_deleted | COVERED |
| medication-service | addRefillTransaction | inventory_adjusted | COVERED |
| medication-service | editInventoryTransaction | inventory_adjusted | COVERED |
| medication-service | deleteInventoryTransaction | inventory_adjusted | COVERED |
| medication-service | activatePhase | phase_activated | COVERED |
| medication-service | addNewPhase | phase_started | COVERED |
| medication-service | updateInteractionData | prescription_updated | COVERED |
| medication-service | deletePhase | phase_completed | COVERED |
| dose-log-service | takeDose | dose_taken | COVERED |
| dose-log-service | untakeDose | dose_untaken | COVERED |
| dose-log-service | skipDose | dose_skipped | COVERED |
| dose-log-service | rescheduleDose | dose_rescheduled | COVERED |
| medication-schedule-service | addSchedule | prescription_updated | COVERED |
| medication-schedule-service | updateSchedule | prescription_updated | COVERED |
| medication-schedule-service | deleteSchedule | prescription_updated | COVERED |
| titration-service | createTitrationPlan | phase_started | COVERED |
| titration-service | updateTitrationPlan | titration_plan_updated | COVERED |
| titration-service | activateTitrationPlan | phase_activated | COVERED |
| titration-service | completeTitrationPlan | phase_completed | COVERED |
| titration-service | cancelTitrationPlan | phase_completed | COVERED |
| titration-service | deleteTitrationPlan | phase_completed | COVERED |
| inventory-service | recalculateStock | stock_recalculated | COVERED |
| backup-service | exportBackup | data_export | COVERED |
| backup-service | importBackup | data_import | COVERED |

### Gaps Found

| Service | Function | Missing Action | Priority |
|---------|----------|---------------|----------|
| **None found** | All mutation paths are covered | -- | -- |

**Audit trail analysis is complete.** All medication mutation paths in medication-service, dose-log-service, titration-service, and medication-schedule-service have `buildAuditEntry` calls inside their transactions. The interaction check (updateInteractionData in medication-service) is also covered.

The deleteTitrationPlan function uses `phase_completed` as its audit action with `action: "titration_deleted"` in the details -- this is a reasonable reuse of existing action types. No new AuditAction types are needed.

**Note:** There are two audit systems in the codebase:
1. `audit-service.ts` -- `buildAuditEntry()` for use inside transactions (synchronous entry creation)
2. `audit.ts` -- `logAudit()` with buffered async writes (used by backup-service, retention, perplexity)

Both write to the same `auditLogs` table. The backup service currently uses `logAudit()` from `audit.ts`, which is correct since export/import are not inside Dexie transactions.

## Common Pitfalls

### Pitfall 1: Memory pressure with large datasets
**What goes wrong:** Loading all records from all 16 tables simultaneously into memory can cause OOM on mobile devices.
**Why it happens:** Promise.all with .toArray() on every table loads everything at once.
**How to avoid:** For export, this is unavoidable (must serialize all data). For import conflict detection, use `.primaryKeys()` to get existing IDs first, then only `.get(id)` for records that need comparison. Don't load all existing records into memory.
**Warning signs:** Import fails silently on phones with limited memory.

### Pitfall 2: Forgetting to clear new tables in replace mode
**What goes wrong:** Replace mode clears existing 7 tables but not the 9 new ones, leaving stale medication data.
**Why it happens:** The `if (mode === "replace")` block only lists original tables.
**How to avoid:** Add all new tables to the replace clear block.

### Pitfall 3: Relational integrity in medication tables
**What goes wrong:** Importing prescriptions without their phases/schedules/inventory creates orphaned references.
**Why it happens:** Medication data has foreign key relationships: Prescription -> Phase -> Schedule, Prescription -> InventoryItem -> InventoryTransaction, Phase -> DoseLog.
**How to avoid:** Import order doesn't matter for Dexie (no FK constraints), but the backup MUST include all related tables together. Partial imports are safe because merge adds missing records.
**Warning signs:** Medication views show prescriptions with no schedules or missing inventory.

### Pitfall 4: Conflict resolution applying stale data
**What goes wrong:** User resolves conflicts after import, but the "current" data shown may have changed if the user navigated away and made changes.
**Why it happens:** Conflict snapshots captured at import time become stale.
**How to avoid:** When applying conflict resolution, re-fetch the current record and verify it hasn't changed. If it has, re-compare.

### Pitfall 5: Two audit modules creating confusion
**What goes wrong:** Using `logAudit` (buffered, async) inside a Dexie transaction silently fails.
**Why it happens:** `logAudit` writes via setTimeout buffer, which runs outside the transaction scope.
**How to avoid:** Inside `db.transaction()`, always use `buildAuditEntry()` + `db.auditLogs.add()`. Outside transactions, `logAudit()` is fine.

## Code Examples

### Extending BackupData interface
```typescript
// Add as optional fields for backward compatibility with v4
export interface BackupData {
  version: number;
  exportedAt: string;
  appVersion?: string;
  // Existing tables...
  intakeRecords: IntakeRecord[];
  weightRecords: WeightRecord[];
  bloodPressureRecords: BloodPressureRecord[];
  eatingRecords?: EatingRecord[];
  urinationRecords?: UrinationRecord[];
  defecationRecords?: DefecationRecord[];
  substanceRecords?: SubstanceRecord[];
  settings?: Record<string, unknown>;
  // New tables (all optional for v4 compat)
  prescriptions?: Prescription[];
  medicationPhases?: MedicationPhase[];
  phaseSchedules?: PhaseSchedule[];
  inventoryItems?: InventoryItem[];
  inventoryTransactions?: InventoryTransaction[];
  doseLogs?: DoseLog[];
  titrationPlans?: TitrationPlan[];
  dailyNotes?: DailyNote[];
  auditLogs?: AuditLog[];
}
```

### Conflict detection pattern
```typescript
// For each backup record in a table:
const existing = await db.tableName.get(backupRecord.id);
if (!existing) {
  newRecords.push(backupRecord);
} else if (isContentEqual(existing, backupRecord)) {
  skippedCount++;
} else {
  conflicts.push({
    table: "tableName",
    id: backupRecord.id,
    current: existing,
    backup: backupRecord,
  });
}
```

### Validator pattern for new tables
```typescript
function isValidPrescription(record: unknown): record is Prescription {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.genericName === "string" &&
    typeof r.indication === "string" &&
    typeof r.isActive === "boolean"
  );
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | vitest.config.ts |
| Quick run command | `pnpm vitest run --reporter=verbose` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | Export includes all 16 tables | unit | `pnpm vitest run src/__tests__/backup/export-all-tables.test.ts -x` | Wave 0 |
| DATA-02 | Export -> clear -> import -> verify round-trip | integration | `pnpm vitest run src/__tests__/backup/round-trip.test.ts -x` | Wave 0 |
| DATA-02 | Merge import with conflict detection | unit | `pnpm vitest run src/__tests__/backup/merge-conflicts.test.ts -x` | Wave 0 |
| DATA-02 | V4 backup imports into v5 schema | unit | `pnpm vitest run src/__tests__/backup/v4-compat.test.ts -x` | Wave 0 |
| DATA-03 | Audit coverage verification | unit | `pnpm vitest run src/__tests__/backup/audit-coverage.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter=verbose`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/backup/` directory -- new test directory for backup tests
- [ ] `src/__tests__/backup/round-trip.test.ts` -- covers DATA-02
- [ ] `src/__tests__/backup/merge-conflicts.test.ts` -- covers DATA-02 conflict detection
- [ ] `src/__tests__/backup/export-all-tables.test.ts` -- covers DATA-01
- [ ] `src/__tests__/backup/v4-compat.test.ts` -- covers v4 backward compat
- [ ] Fixture factories for medication tables (prescriptions, phases, etc.) -- extend `db-fixtures.ts`

## Open Questions

1. **Conflict resolution persistence**
   - What we know: Conflicts are detected during import and shown in a Drawer
   - What's unclear: Should conflicts be persisted to survive page refresh, or is in-memory sufficient?
   - Recommendation: In-memory (React state). Conflicts are transient -- if user refreshes, they can re-import. Persisting adds complexity for little value.

2. **Audit log import policy**
   - What we know: auditLogs are included in backup export
   - What's unclear: Should audit logs be imported during restore? They're append-only debugging data.
   - Recommendation: Import them (merge by ID, skip duplicates). They're useful for debugging and the user explicitly chose to include them in backup scope.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of `backup-service.ts`, `audit-service.ts`, `audit.ts`, `db.ts`
- Direct codebase analysis of all medication service files for audit trail coverage
- Direct codebase analysis of `data-management-section.tsx` and `use-backup-queries.ts` for UI patterns

### Secondary (MEDIUM confidence)
- Dexie.js patterns from project codebase (established in 14 schema versions)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, extending existing patterns
- Architecture: HIGH - clear existing patterns to follow, well-understood data model
- Pitfalls: HIGH - identified from direct code analysis of current implementation
- Audit coverage: HIGH - exhaustive grep of all mutation functions vs buildAuditEntry calls

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable -- no external dependencies changing)
