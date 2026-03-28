/**
 * Three-way table sync tests (DATA-07).
 *
 * Enforces that every table in db.ts has a corresponding:
 *   1. Key in the BackupData interface (backup-service.ts)
 *   2. Fixture maker function (db-fixtures.ts)
 *
 * Also checks for orphans in the reverse direction.
 *
 * Static analysis only: reads source files from disk, never imports Dexie.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getLatestTables } from "./parse-schema";

// --- BackupData interface parser ---

function parseBackupDataKeys(): string[] {
  const backupPath = resolve(__dirname, "../../lib/backup-service.ts");
  const source = readFileSync(backupPath, "utf-8");

  // Extract the BackupData interface block
  const interfaceMatch = source.match(
    /export interface BackupData\s*\{([^}]+)\}/s
  );
  if (!interfaceMatch) {
    throw new Error(
      "parse-schema: Failed to find BackupData interface in backup-service.ts"
    );
  }

  const block = interfaceMatch[1]!;

  // Parse property names: word before `:` or `?:`
  const propPattern = /^\s*(\w+)\??\s*:/gm;
  const keys: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = propPattern.exec(block)) !== null) {
    keys.push(match[1]!);
  }

  // Exclude metadata fields that are not data tables
  const METADATA_KEYS = ["version", "exportedAt", "appVersion", "settings"];
  return keys.filter((k) => !METADATA_KEYS.includes(k));
}

// --- Fixture maker function parser ---

function parseFixtureMakers(): Set<string> {
  const fixturesPath = resolve(__dirname, "../fixtures/db-fixtures.ts");
  const source = readFileSync(fixturesPath, "utf-8");

  const fnPattern = /export function (make\w+)/g;
  const fns = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = fnPattern.exec(source)) !== null) {
    fns.add(match[1]!);
  }

  return fns;
}

// --- Explicit table-to-fixture mapping ---
// Hardcoded because naming is non-trivial (e.g., "doseLogs" -> "makeDoseLog",
// "prescriptions" -> "makePrescription" — plural/singular inconsistency).

const TABLE_TO_FIXTURE: Record<string, string> = {
  intakeRecords: "makeIntakeRecord",
  weightRecords: "makeWeightRecord",
  bloodPressureRecords: "makeBloodPressureRecord",
  eatingRecords: "makeEatingRecord",
  urinationRecords: "makeUrinationRecord",
  defecationRecords: "makeDefecationRecord",
  substanceRecords: "makeSubstanceRecord",
  prescriptions: "makePrescription",
  medicationPhases: "makeMedicationPhase",
  phaseSchedules: "makePhaseSchedule",
  inventoryItems: "makeInventoryItem",
  inventoryTransactions: "makeInventoryTransaction",
  doseLogs: "makeDoseLog",
  titrationPlans: "makeTitrationPlan",
  dailyNotes: "makeDailyNote",
  auditLogs: "makeAuditLog",
};

describe("db.ts <-> BackupData sync", () => {
  it("every db.ts table has a BackupData key", () => {
    const tables = getLatestTables();
    const backupKeys = new Set(parseBackupDataKeys());

    const missing = tables.filter((t) => !backupKeys.has(t));

    for (const table of missing) {
      expect.unreachable(
        [
          `x [Table Sync]: db.ts table '${table}' has no key in BackupData interface`,
          `  Missing: '${table}' key in BackupData`,
          `  Fix: Add '${table}?: {TypeName}[]' to the BackupData interface in src/lib/backup-service.ts`,
        ].join("\n")
      );
    }

    expect(missing).toHaveLength(0);
  });

  it("every BackupData data key has a db.ts table", () => {
    const tables = new Set(getLatestTables());
    const backupKeys = parseBackupDataKeys();

    const orphans = backupKeys.filter((k) => !tables.has(k));

    for (const key of orphans) {
      expect.unreachable(
        [
          `x [Table Sync]: BackupData key '${key}' has no corresponding table in db.ts`,
          `  Orphan: '${key}' in BackupData interface`,
          `  Fix: Either add a '${key}' table to db.ts or remove the key from BackupData in src/lib/backup-service.ts`,
        ].join("\n")
      );
    }

    expect(orphans).toHaveLength(0);
  });
});

describe("db.ts <-> fixture sync", () => {
  it("every db.ts table has a fixture maker function", () => {
    const tables = getLatestTables();
    const fixtureFns = parseFixtureMakers();

    const missing: Array<{ table: string; expectedFn: string }> = [];

    for (const table of tables) {
      const expectedFn = TABLE_TO_FIXTURE[table];
      if (!expectedFn || !fixtureFns.has(expectedFn)) {
        missing.push({ table, expectedFn: expectedFn ?? `make${table}` });
      }
    }

    for (const { table, expectedFn } of missing) {
      expect.unreachable(
        [
          `x [Table Sync]: db.ts table '${table}' has no fixture maker`,
          `  Missing: '${expectedFn}' in src/__tests__/fixtures/db-fixtures.ts`,
          `  Fix: Add 'export function ${expectedFn}(...)' to db-fixtures.ts`,
        ].join("\n")
      );
    }

    expect(missing).toHaveLength(0);
  });

  it("TABLE_TO_FIXTURE mapping covers all db.ts tables", () => {
    const tables = new Set(getLatestTables());
    const mappedTables = new Set(Object.keys(TABLE_TO_FIXTURE));

    // Tables in db.ts not in mapping
    const unmapped = [...tables].filter((t) => !mappedTables.has(t));
    expect(
      unmapped,
      `TABLE_TO_FIXTURE is missing mappings for: ${unmapped.join(", ")}. ` +
        `Fix: Add the missing table(s) to the TABLE_TO_FIXTURE constant in table-sync.test.ts`
    ).toHaveLength(0);

    // Tables in mapping not in db.ts (stale entries)
    const stale = [...mappedTables].filter((t) => !tables.has(t));
    expect(
      stale,
      `TABLE_TO_FIXTURE has stale entries: ${stale.join(", ")}. ` +
        `Fix: Remove these from the TABLE_TO_FIXTURE constant in table-sync.test.ts`
    ).toHaveLength(0);
  });
});
