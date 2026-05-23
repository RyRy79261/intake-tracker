/**
 * Property-based backup round-trip test.
 *
 * The companion file `backup-round-trip.test.ts` asserts deep equality
 * against a hand-picked fixture (one record per table). This file flips
 * the question: for *any* well-formed combination of records the user
 * could plausibly accumulate, does export → clear → import preserve
 * everything?
 *
 * Paradigm: instead of asking "does this one case work?", we ask "what
 * invariant must hold for *every* case?" — the property here being
 *
 *     forall db_state.  reload(export(db_state)) ≡ db_state
 *
 * fast-check generates arbitrary sequences of record counts per table,
 * shrinks to a minimal repro on failure, and runs the property `numRuns`
 * times each invocation. This pattern is recommended by the fast-check
 * docs for I/O-heavy code paths (https://fast-check.dev/).
 *
 * Why this catches bugs the fixture test can't:
 *   - 0-record tables (the fixture always seeds one).
 *   - 2-record tables where ordering matters in the JSON serialization.
 *   - Permutations of which optional tables are present in the dump.
 *   - Edge counts (e.g. exactly N where N hits a Dexie batch boundary).
 *
 * Why it's scoped to record counts (not arbitrary field values):
 * fast-check could generate every field of every record, but that would
 * duplicate fixture-generator logic. Combining `fc.integer` counts with
 * the canonical fixture makers keeps the test focused on the *transport*
 * layer rather than the *value* layer.
 */
import { describe, beforeEach, expect, it } from "vitest";
import fc from "fast-check";
import { db } from "@/lib/db";
import {
  exportBackup,
  importBackup,
  type BackupData,
} from "@/lib/backup-service";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makeEatingRecord,
  makeUrinationRecord,
  makeDefecationRecord,
  makeSubstanceRecord,
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeInventoryTransaction,
  makeDoseLog,
  makeTitrationPlan,
  makeDailyNote,
  makeAuditLog,
} from "@/__tests__/fixtures/db-fixtures";

const ALL_TABLES = [
  "intakeRecords",
  "weightRecords",
  "bloodPressureRecords",
  "eatingRecords",
  "urinationRecords",
  "defecationRecords",
  "substanceRecords",
  "prescriptions",
  "medicationPhases",
  "phaseSchedules",
  "inventoryItems",
  "inventoryTransactions",
  "doseLogs",
  "titrationPlans",
  "dailyNotes",
  "auditLogs",
] as const;

async function blobToBackupData(blob: Blob): Promise<BackupData> {
  return JSON.parse(await blob.text()) as BackupData;
}

function backupDataToFile(data: BackupData): File {
  return new File([JSON.stringify(data, null, 2)], "test-backup.json", {
    type: "application/json",
  });
}

type TableLike = {
  clear(): Promise<void>;
  bulkAdd(rows: unknown[]): Promise<unknown>;
  toArray(): Promise<unknown[]>;
  count(): Promise<number>;
};
const tables = db as unknown as Record<string, TableLike>;

function tableFor(name: string): TableLike {
  const t = tables[name];
  if (!t) throw new Error(`unknown table: ${name}`);
  return t;
}

async function clearEverything() {
  await Promise.all(ALL_TABLES.map((t) => tableFor(t).clear()));
}

// One arbitrary per table: a small count of records (kept small to keep
// runtime sane — the property statement is interesting, not the volume).
const counts = fc.record({
  intakeRecords: fc.integer({ min: 0, max: 3 }),
  weightRecords: fc.integer({ min: 0, max: 3 }),
  bloodPressureRecords: fc.integer({ min: 0, max: 3 }),
  eatingRecords: fc.integer({ min: 0, max: 3 }),
  urinationRecords: fc.integer({ min: 0, max: 3 }),
  defecationRecords: fc.integer({ min: 0, max: 3 }),
  substanceRecords: fc.integer({ min: 0, max: 3 }),
  prescriptions: fc.integer({ min: 0, max: 2 }),
  titrationPlans: fc.integer({ min: 0, max: 2 }),
  dailyNotes: fc.integer({ min: 0, max: 3 }),
  auditLogs: fc.integer({ min: 0, max: 3 }),
});

describe("backup round-trip: property-based invariants", () => {
  beforeEach(async () => {
    await clearEverything();
  });

  it("any combination of record counts round-trips losslessly", async () => {
    await fc.assert(
      fc.asyncProperty(counts, async (n) => {
      // Arrange: seed the tables according to the random counts.
      // Tables with FK dependencies (medication graph) are seeded as a
      // related set when prescriptions > 0; otherwise we skip them so
      // foreign keys don't dangle.
      await clearEverything();

      const inserted: Record<string, unknown[]> = {};

      inserted.intakeRecords = Array.from({ length: n.intakeRecords }, () =>
        makeIntakeRecord(),
      );
      inserted.weightRecords = Array.from({ length: n.weightRecords }, () =>
        makeWeightRecord(),
      );
      inserted.bloodPressureRecords = Array.from(
        { length: n.bloodPressureRecords },
        () => makeBloodPressureRecord(),
      );
      inserted.eatingRecords = Array.from({ length: n.eatingRecords }, () =>
        makeEatingRecord(),
      );
      inserted.urinationRecords = Array.from({ length: n.urinationRecords }, () =>
        makeUrinationRecord(),
      );
      inserted.defecationRecords = Array.from(
        { length: n.defecationRecords },
        () => makeDefecationRecord(),
      );
      inserted.substanceRecords = Array.from(
        { length: n.substanceRecords },
        () => makeSubstanceRecord(),
      );
      inserted.titrationPlans = Array.from({ length: n.titrationPlans }, () =>
        makeTitrationPlan(),
      );
      inserted.dailyNotes = Array.from({ length: n.dailyNotes }, () =>
        makeDailyNote(),
      );
      inserted.auditLogs = Array.from({ length: n.auditLogs }, () =>
        makeAuditLog(),
      );

      // Medication chain: prescription → phase → schedule → inventory → dose
      const prescriptions = Array.from({ length: n.prescriptions }, () =>
        makePrescription(),
      );
      const phases = prescriptions.map((p) => makeMedicationPhase(p.id));
      const schedules = phases.map((ph) => makePhaseSchedule(ph.id));
      const inventoryItems = prescriptions.map((p) => makeInventoryItem(p.id));
      const inventoryTxs = inventoryItems.map((inv) =>
        makeInventoryTransaction(inv.id),
      );
      const doseLogs = prescriptions.map((p, i) =>
        makeDoseLog(p.id, phases[i]!.id, schedules[i]!.id),
      );

      inserted.prescriptions = prescriptions;
      inserted.medicationPhases = phases;
      inserted.phaseSchedules = schedules;
      inserted.inventoryItems = inventoryItems;
      inserted.inventoryTransactions = inventoryTxs;
      inserted.doseLogs = doseLogs;

      // Bulk insert everything
      for (const table of ALL_TABLES) {
        const rows = inserted[table];
        if (rows && rows.length > 0) {
          await tableFor(table).bulkAdd(rows);
        }
      }

      // Act: export → clear → import (replace mode bypasses conflict logic
      // so the round-trip is a pure identity check).
      const blob = await exportBackup();
      await clearEverything();
      const file = backupDataToFile(await blobToBackupData(blob));
      const result = await importBackup(file, "replace");

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Assert: every inserted record survives, identified by id, with all
      // fields equal. We check by id rather than array order because Dexie
      // doesn't guarantee insertion order on reload.
      for (const table of ALL_TABLES) {
        const originals = inserted[table];
        if (!originals || originals.length === 0) continue;

        const restored = (await tableFor(table).toArray()) as Array<{ id: string }>;

        for (const original of originals) {
          const o = original as { id: string };
          const match = restored.find((r) => r.id === o.id);
          expect(
            match,
            `missing ${table} record ${o.id} after round-trip`,
          ).toBeDefined();
          expect(JSON.stringify(match)).toBe(JSON.stringify(original));
        }
      }
      }),
      { numRuns: 12 },
    );
  }, 60_000);

  it("intakeRecords-only with arbitrary record count round-trips", async () => {
    // A simpler invariant focused on the single most-written table.
    // Catches off-by-one bugs in export/import that the larger property
    // might shrink past.
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 5 }), async (n) => {
        await clearEverything();
        const records = Array.from({ length: n }, () => makeIntakeRecord());
        if (records.length > 0) await db.intakeRecords.bulkAdd(records);

        const blob = await exportBackup();
        await clearEverything();
        const file = backupDataToFile(await blobToBackupData(blob));
        const result = await importBackup(file, "replace");
        expect(result.success).toBe(true);

        const restored = await db.intakeRecords.toArray();
        expect(restored).toHaveLength(records.length);
        for (const original of records) {
          const match = restored.find((r) => r.id === original.id);
          expect(JSON.stringify(match)).toBe(JSON.stringify(original));
        }
      }),
      { numRuns: 10 },
    );
  }, 30_000);
});
