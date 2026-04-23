/**
 * Sync topology — static FK parent-before-child ordering for the 16 Dexie/Neon
 * data tables (Phase 43 D-02).
 *
 * Derived from src/db/schema.ts FK declarations. The push loop (Plan 06) groups
 * queued ops by table and flushes in this order so every FK parent lands on
 * the server before any child that references it.
 *
 * Canonical refs:
 * - `.planning/phases/43-sync-engine-core/43-CONTEXT.md` §D-02 — static topo sort
 * - `.planning/phases/43-sync-engine-core/43-PATTERNS.md` §"src/lib/sync-topology.ts"
 * - Covered by `src/__tests__/sync-topology.test.ts`
 *
 * FK graph (parent → child), derived verbatim from src/db/schema.ts:
 *   prescriptions   → medicationPhases, inventoryItems, doseLogs, dailyNotes
 *   titrationPlans  → medicationPhases
 *   medicationPhases → phaseSchedules, doseLogs
 *   phaseSchedules  → doseLogs
 *   inventoryItems  → doseLogs, inventoryTransactions
 *   doseLogs        → inventoryTransactions, dailyNotes
 *   intakeRecords   → substanceRecords
 *
 * IMPORTANT: any FK addition/change in src/db/schema.ts MUST be reflected here.
 * The parity test "every FK pair … satisfies parent-before-child" fails fast
 * if this array drifts out of sync with the Drizzle schema.
 */

export const TABLE_PUSH_ORDER = [
  // Tier 1 — roots (no inner FKs)
  "prescriptions",
  "titrationPlans",
  // Tier 2 — children of tier 1
  "medicationPhases",
  // Tier 3 — children of medicationPhases
  "phaseSchedules",
  "inventoryItems",
  // Tier 4 — doseLogs needs prescriptions, medicationPhases, phaseSchedules, inventoryItems
  "doseLogs",
  // Tier 5 — needs inventoryItems + doseLogs (and dailyNotes needs doseLogs)
  "inventoryTransactions",
  "dailyNotes",
  // Health records graph
  "intakeRecords",
  "substanceRecords",
  // Remaining leaf tables (no inner FKs)
  "weightRecords",
  "bloodPressureRecords",
  "eatingRecords",
  "urinationRecords",
  "defecationRecords",
  "auditLogs",
] as const;

/** Literal union of the 16 valid table names. */
export type TableName = (typeof TABLE_PUSH_ORDER)[number];
