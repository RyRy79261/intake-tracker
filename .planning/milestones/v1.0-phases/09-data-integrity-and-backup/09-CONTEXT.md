# Phase 9: Data Integrity and Backup - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing backup/restore system to include all medication tables, implement merge-based restore with optional collision review, and verify audit trail completeness across all medication mutation paths. No new UI beyond the restore collision review flow.

</domain>

<decisions>
## Implementation Decisions

### Backup scope
- Add ALL remaining user data tables to the existing backup:
  - prescriptions, medicationPhases, phaseSchedules, inventoryItems, inventoryTransactions, doseLogs, titrationPlans, dailyNotes, auditLogs
- Existing tables already included: intakeRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords, defecationRecords, substanceRecords, settings
- Bump `CURRENT_BACKUP_VERSION` to 5
- Update `BackupData` interface and `ImportResult` to include new table counts

### Restore behavior — merge with collision review
- Default restore mode is MERGE (not wipe-and-replace)
- Import new records (by ID) that don't exist locally
- Skip exact duplicates silently
- Detect conflicts: records with same ID but different content
- After import: show summary — "Imported: N new, M skipped, K conflicts"
- "Review K conflicts?" button opens a list where user picks keep-current or use-backup per conflict
- "Skip review" keeps existing data for all conflicts
- Confirmation warning before starting restore

### Audit trail
- Verify every medication mutation path has a `buildAuditEntry` call
- Fill any gaps found (e.g., titration plan create/update/delete, interaction check)
- No audit viewer UI — backend-only for now (audit logs are included in backup for debugging)

### Claude's Discretion
- Exact collision comparison logic (deep equality vs field-by-field)
- How to display conflict diffs in the review UI (side-by-side, inline, etc.)
- Whether to batch conflict resolution ("keep all current" / "use all backup" buttons)
- Migration handling for restoring v4 backups into v5 schema (add missing fields with defaults)

</decisions>

<canonical_refs>
## Canonical References

No external specs — requirements fully captured in decisions above.

### Existing backup system
- `src/lib/backup-service.ts` — Current backup/restore implementation (v4, health records only). This is the primary file to extend.
- `src/lib/crypto.ts` — AES-GCM encryption for encrypted backups
- `src/lib/audit-service.ts` — `buildAuditEntry` and `logAudit` functions
- `src/lib/db.ts` — All Dexie table definitions and interfaces

### Audit trail sources (verify coverage)
- `src/lib/medication-service.ts` — prescription CRUD, inventory, phase management
- `src/lib/dose-log-service.ts` — take, skip, untake, reschedule doses
- `src/lib/titration-service.ts` — titration plan CRUD
- `src/lib/medication-schedule-service.ts` — schedule CRUD

### Settings UI
- `src/app/settings/page.tsx` — Where backup/restore buttons live

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backup-service.ts`: `exportBackup()` and `importBackup()` already handle health records — extend pattern for medication tables
- `BackupData` interface: add new table arrays as optional fields (backward-compatible with v4 backups)
- `ImportResult` interface: add new count fields
- `buildAuditEntry()`: standardized audit entry creation used across all services
- `encrypt()`/`decrypt()`: transparent — works on any JSON blob

### Established Patterns
- Backup uses `Promise.all` with `db.tableName.toArray()` for export
- Import uses `db.tableName.bulkPut()` for upsert
- Encrypted backup wraps the same data with AES-GCM
- Audit entries: `buildAuditEntry(action, details)` → `db.auditLogs.add(entry)` inside transactions

### Integration Points
- `backup-service.ts` — extend `exportBackup()` and `importBackup()`
- `settings/page.tsx` — restore flow UI (collision review drawer/modal)
- All medication service files — audit gap check

</code_context>

<specifics>
## Specific Ideas

- Merge is the default restore mode — user's current data is preserved, backup fills gaps
- Collision review should feel lightweight — summary first, optional drill-down
- "Keep all current" / "Use all backup" batch buttons would be nice for when there are many conflicts

</specifics>

<deferred>
## Deferred Ideas

- Audit log viewer UI — future phase, useful for debugging but out of scope here
- Automatic scheduled backups — separate capability
- Cloud sync — out of scope for this milestone

</deferred>

---

*Phase: 09-data-integrity-and-backup*
*Context gathered: 2026-03-20*
