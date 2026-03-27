# Phase 1: Schema Foundation - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Dexie v10 migration with compound indexes, event-sourced inventory, sync-ready timestamps, and test infrastructure. All existing user data must survive migration intact. This phase establishes the data foundation that every subsequent phase depends on.

</domain>

<decisions>
## Implementation Decisions

### Migration Strategy
- Fresh start at v10 — delete old v4-v9 migration/upgrade code, define one clean schema
- User's existing data MUST be preserved — this is the hard constraint
- Claude decides the versioning approach (single v10 vs split across versions)
- Migration test harness verifies both schema upgrade success AND data integrity (field values survive correctly)
- Test fixtures are synthetic only — no real medical data in the codebase
- Synthetic fixtures must cover edge cases: empty fields, optional fields missing, records from old schema versions

### Event-Sourced Inventory
- Pure event sourcing — `currentStock` is never stored as a mutable field, always derived from `inventoryTransactions`
- Every stock change is a transaction, including initial stock when adding an inventory item (type: "initial")
- UI shows cached/computed count instantly with a subtle indicator for fresh vs stale (UI implementation in Phase 6, but the data layer must support this pattern)
- `InventoryTransaction` gets a `doseLogId` field linking consumed stock back to the specific dose that caused it — full traceability
- When a transaction causes stock to hit the refill warning threshold, trigger a once-per-day alert (not per-transaction spam)

### Sync-Readiness Fields
- ALL tables get the full field set: `createdAt`, `updatedAt`, `deletedAt`, `deviceId`
- Standardize across every table — no exceptions
- Future sync target is **NeonDB** (serverless Postgres on Vercel), NOT Dexie Cloud
- `deviceId` instead of Dexie-specific `realmId` — more portable for custom sync layer
- Soft deletes via `deletedAt` — deleted items move to an archive view, not hard removed from the UI
- Conflict resolution strategy: Claude's discretion (user has no preference)

### Index Design
- Every table gets timestamp-based compound indexes optimized for date-range queries
- No table left behind — all health record tables (weight, BP, urination, defecation, eating, intake) must be fast for date-range queries
- Compound indexes from research: `[prescriptionId+scheduledDate]` on doseLogs, `[inventoryItemId+timestamp]` on inventoryTransactions, `[type+timestamp]` on intakeRecords
- Additional indexes on all health tables to enable cross-domain correlation queries
- Target query patterns: "correlate water intake with urination over time", "food patterns affecting outputs", "days with high water intake vs other metrics", "missed doses in date range", "compliance per prescription"

### Claude's Discretion
- Versioning strategy (single v10 vs multiple versions)
- Conflict resolution approach for future NeonDB sync
- Exact compound index definitions per table beyond the researched recommendations
- Migration code structure and error handling patterns
- Test harness architecture and synthetic data generation approach

</decisions>

<specifics>
## Specific Ideas

- User has 600+ local entries currently — charts page shows visible slowness, confirming indexes are needed now not just for future-proofing
- Inventory stock display should show fresh/stale indicator (think: subtle icon or color that shows whether the count is cached or freshly computed)
- Refill alert should fire once per day max when threshold is breached, not on every transaction
- The dose-to-transaction link enables future queries like "which prescriptions am I most compliant with" by tracing dose logs through to inventory depletion

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db.ts`: Current Dexie instance with all 14 table definitions and interfaces — will be rewritten for v10
- `InventoryTransaction` interface already exists with `type: "refill" | "consumed" | "adjusted"` — needs "initial" added
- All entity interfaces defined in `db.ts` — need `createdAt`, `updatedAt`, `deletedAt`, `deviceId` added

### Established Patterns
- String UUIDs for all primary keys (sync-friendly, no changes needed)
- Dexie `EntityTable<T, "id">` typing pattern for all tables
- Schema versions must repeat all store definitions (Dexie requirement)
- Upgrade functions run inside implicit transactions

### Integration Points
- Every `*-service.ts` file imports from `db.ts` — interface changes propagate everywhere
- `backup-service.ts` exports/imports tables — must be updated for new fields
- `tsconfig.json` has `strict: true` but missing `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (Phase 2 concern, but schema types should be written to survive those flags)

</code_context>

<deferred>
## Deferred Ideas

- Lazy rendering on history/charts page — Phase 6+ UI concern, not schema
- Analytics service cross-domain query functions — Phase 4
- Archive view UI for soft-deleted items — Phase 6+

</deferred>

---

*Phase: 01-schema-foundation*
*Context gathered: 2026-03-02*
