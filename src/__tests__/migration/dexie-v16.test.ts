import { describe, it, expect } from "vitest";

// NOTE: This test uses the raw indexedDB.open() API to seed at a specific
// version, then opens the Dexie-managed DB to trigger the v16 upgrade.
// Pattern mirrors src/__tests__/migration/v15-migration.test.ts exactly.
// Dexie multiplies db.version(N) by 10 for the IDB version.

describe("v16 migration: _syncQueue + _syncMeta tables added", () => {
  it("MISSING — Dexie v16 upgrade not implemented yet (Plan 02)", () => {
    expect.fail("db.version(16) not added in src/lib/db.ts — see 43-02-PLAN.md");
  });

  it.todo("existing v15 intakeRecords survive v16 upgrade with all data intact");
  it.todo("_syncQueue table exists and is empty after upgrade");
  it.todo("_syncMeta table exists and is empty after upgrade");
  it.todo("round-trip: _syncQueue coalesce lookup by [tableName+recordId] compound index");
  it.todo("round-trip: _syncMeta put+get by tableName primary key");
  it.todo("all 16 data tables retained (none dropped by omission)");
});
