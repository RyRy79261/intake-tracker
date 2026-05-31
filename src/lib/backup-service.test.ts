/**
 * Failure-path tests for backup-service.
 *
 * What's already covered elsewhere:
 *   - src/__tests__/integrity/backup-round-trip.test.ts asserts that the
 *     export → import cycle preserves every field on the happy path.
 *   - src/__tests__/integrity/backup-round-trip.property.test.ts asserts
 *     the same as a fast-check property over generated state.
 *   - src/hooks/use-backup-queries.test.tsx exercises the React Query
 *     hook surface.
 *
 * This file covers the things they don't:
 *   - JSON parse failures (truncated, empty, non-object).
 *   - Schema-invalid backups (missing/wrong-typed fields).
 *   - Legacy v1 backup shape (records[] instead of intakeRecords[]).
 *   - Merge-mode conflict detection vs same-content skip.
 *   - Replace mode actually clearing existing rows.
 *   - resolveConflicts overwrite / keep semantics.
 *   - getBackupStats on empty + populated databases.
 *   - generateBackupFilename format.
 */

import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import {
  exportBackup,
  importBackup,
  resolveConflicts,
  getBackupStats,
  generateBackupFilename,
} from "@/lib/backup-service";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makePrescription,
  makeInventoryItem,
  makeDailyNote,
} from "@/__tests__/fixtures/db-fixtures";

// Tests run in the node vitest environment (per vitest.config.ts), so File,
// Blob, and crypto.subtle are present (Node 22+). document is NOT present —
// downloadBackup() is deliberately not covered here because it relies on
// document.createElement("a") to trigger the browser download UI.

function makeBackupJson(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 5,
    exportedAt: new Date().toISOString(),
    intakeRecords: [],
    weightRecords: [],
    bloodPressureRecords: [],
    ...extra,
  });
}

function makeFile(body: string, name = "backup.json"): File {
  return new File([body], name, { type: "application/json" });
}

describe("backup-service: importBackup JSON parse failures", () => {
  it("reports 'Invalid JSON format' on truncated input", async () => {
    const file = makeFile('{"version": 5, "exportedAt": "x"');
    const res = await importBackup(file);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.success).toBe(false);
    expect(res.data.errors).toContain("Invalid JSON format");
  });

  it("reports 'Invalid JSON format' on empty input", async () => {
    const file = makeFile("");
    const res = await importBackup(file);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.errors).toContain("Invalid JSON format");
  });

  it("rejects non-object JSON (number / string / array) with a schema error", async () => {
    for (const body of ["42", '"hello"', "[1,2,3]"]) {
      const file = makeFile(body);
      const res = await importBackup(file);
      expect(res.success).toBe(true);
      if (!res.success) continue;
      // Either the parser bails ("Invalid backup file format") or the
      // validator does — either way no import happens and errors is non-empty.
      expect(res.data.errors.length).toBeGreaterThan(0);
      expect(res.data.success).toBe(false);
    }
  });
});

describe("backup-service: importBackup schema validation", () => {
  it("rejects a payload missing the 'version' field", async () => {
    const body = JSON.stringify({
      exportedAt: new Date().toISOString(),
      intakeRecords: [],
      weightRecords: [],
      bloodPressureRecords: [],
    });
    const res = await importBackup(makeFile(body));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.errors).toContain("Invalid backup file format");
  });

  it("rejects when an array-typed field is not an array", async () => {
    const body = JSON.stringify({
      version: 5,
      exportedAt: new Date().toISOString(),
      intakeRecords: "not an array",
      weightRecords: [],
      bloodPressureRecords: [],
    });
    const res = await importBackup(makeFile(body));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.errors).toContain("Invalid backup file format");
  });

  it("rejects when 'exportedAt' is the wrong type", async () => {
    const body = JSON.stringify({
      version: 5,
      exportedAt: 12345, // number instead of ISO string
      intakeRecords: [],
      weightRecords: [],
      bloodPressureRecords: [],
    });
    const res = await importBackup(makeFile(body));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.errors).toContain("Invalid backup file format");
  });
});

describe("backup-service: legacy v1 format", () => {
  it("upgrades v1 'records' field to 'intakeRecords' and imports successfully", async () => {
    const legacyRecord = makeIntakeRecord({ id: "legacy-1", amount: 333 });
    const body = JSON.stringify({
      version: 1,
      records: [legacyRecord],
    });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.errors).toEqual([]);
    expect(res.data.intakeImported).toBe(1);
    const stored = await db.intakeRecords.get("legacy-1");
    expect(stored?.amount).toBe(333);
  });
});

describe("backup-service: importBackup merge mode", () => {
  it("skips health records whose id already exists in the DB", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "dup", amount: 100 }));

    const backup = makeIntakeRecord({ id: "dup", amount: 999 });
    const body = makeBackupJson({ intakeRecords: [backup] });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.intakeImported).toBe(0);
    expect(res.data.skipped).toBe(1);

    // Existing record untouched.
    const stored = await db.intakeRecords.get("dup");
    expect(stored?.amount).toBe(100);
  });

  it("imports health records whose id is not yet in the DB", async () => {
    const body = makeBackupJson({
      intakeRecords: [makeIntakeRecord({ id: "fresh", amount: 200 })],
    });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.intakeImported).toBe(1);
    expect((await db.intakeRecords.get("fresh"))?.amount).toBe(200);
  });

  it("reports a conflict for medication records with the same id but different content", async () => {
    await db.prescriptions.add(
      makePrescription({ id: "rx-1", genericName: "Lisinopril" })
    );

    const body = makeBackupJson({
      prescriptions: [makePrescription({ id: "rx-1", genericName: "Atenolol" })],
    });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    if (!res.success) return;
    // No silent import — the user must resolve the conflict.
    expect(res.data.prescriptionsImported).toBe(0);
    expect(res.data.conflicts).toHaveLength(1);
    expect(res.data.conflicts[0]).toMatchObject({
      table: "prescriptions",
      id: "rx-1",
    });

    // Existing record stays as-is until resolveConflicts() runs.
    expect((await db.prescriptions.get("rx-1"))?.genericName).toBe("Lisinopril");
  });

  it("skips (does not conflict on) medication records that match an existing record content-wise", async () => {
    const rx = makePrescription({ id: "rx-same", genericName: "Same" });
    await db.prescriptions.add(rx);

    const body = makeBackupJson({ prescriptions: [rx] });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.prescriptionsImported).toBe(0);
    expect(res.data.conflicts).toHaveLength(0);
    expect(res.data.skipped).toBeGreaterThanOrEqual(1);
  });

  it("counts validator rejections in 'skipped' rather than 'imported'", async () => {
    const invalidIntake = { id: "bad", garbage: true } as unknown as ReturnType<
      typeof makeIntakeRecord
    >;
    const body = makeBackupJson({ intakeRecords: [invalidIntake] });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.intakeImported).toBe(0);
    expect(res.data.skipped).toBeGreaterThanOrEqual(1);

    // And nothing was persisted.
    expect(await db.intakeRecords.get("bad")).toBeUndefined();
  });
});

describe("backup-service: importBackup replace mode", () => {
  it("clears existing rows before importing", async () => {
    // Seed pre-existing data that the replace must remove.
    await db.intakeRecords.bulkAdd([
      makeIntakeRecord({ id: "pre-1" }),
      makeIntakeRecord({ id: "pre-2" }),
    ]);
    await db.weightRecords.add(makeWeightRecord({ id: "old-weight" }));

    const body = makeBackupJson({
      intakeRecords: [makeIntakeRecord({ id: "new-1", amount: 500 })],
      weightRecords: [],
      bloodPressureRecords: [],
    });

    const res = await importBackup(makeFile(body), "replace");
    expect(res.success).toBe(true);
    if (!res.success) return;

    // Pre-existing rows gone, only the imported one remains.
    expect(await db.intakeRecords.get("pre-1")).toBeUndefined();
    expect(await db.intakeRecords.get("pre-2")).toBeUndefined();
    expect((await db.intakeRecords.get("new-1"))?.amount).toBe(500);

    // Empty arrays in the backup mean the table ends empty.
    expect(await db.weightRecords.get("old-weight")).toBeUndefined();
    expect(await db.weightRecords.count()).toBe(0);
  });

  it("imports medication records in replace mode without conflict detection", async () => {
    await db.prescriptions.add(makePrescription({ id: "rx-old", genericName: "Old" }));

    const body = makeBackupJson({
      prescriptions: [makePrescription({ id: "rx-old", genericName: "New" })],
    });

    const res = await importBackup(makeFile(body), "replace");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.prescriptionsImported).toBe(1);
    expect(res.data.conflicts).toHaveLength(0);

    expect((await db.prescriptions.get("rx-old"))?.genericName).toBe("New");
  });
});

describe("backup-service: resolveConflicts", () => {
  it("overwrites the existing record when useBackup is true", async () => {
    await db.prescriptions.add(
      makePrescription({ id: "rx-conflict", genericName: "Old" })
    );
    const backupRecord = {
      ...makePrescription({ id: "rx-conflict", genericName: "FromBackup" }),
    } as unknown as Record<string, unknown>;

    const res = await resolveConflicts([
      {
        table: "prescriptions",
        id: "rx-conflict",
        useBackup: true,
        backupRecord,
      },
    ]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.resolved).toBe(1);
    expect((await db.prescriptions.get("rx-conflict"))?.genericName).toBe("FromBackup");
  });

  it("leaves the existing record intact when useBackup is false", async () => {
    await db.prescriptions.add(
      makePrescription({ id: "rx-keep", genericName: "Keep" })
    );

    const res = await resolveConflicts([
      {
        table: "prescriptions",
        id: "rx-keep",
        useBackup: false,
        backupRecord: { id: "rx-keep", genericName: "Discarded" } as unknown as Record<
          string,
          unknown
        >,
      },
    ]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.resolved).toBe(0);
    expect((await db.prescriptions.get("rx-keep"))?.genericName).toBe("Keep");
  });
});

describe("backup-service: getBackupStats", () => {
  it("returns zero counts and null oldest/newest on an empty database", async () => {
    const stats = await getBackupStats();
    expect(stats.totalCount).toBe(0);
    expect(stats.intakeCount).toBe(0);
    expect(stats.oldestRecord).toBeNull();
    expect(stats.newestRecord).toBeNull();
  });

  it("returns table counts and a date range that spans the oldest and newest timestamps", async () => {
    await db.intakeRecords.bulkAdd([
      makeIntakeRecord({ id: "i-1", timestamp: 1000 }),
      makeIntakeRecord({ id: "i-2", timestamp: 5000 }),
    ]);
    await db.weightRecords.add(makeWeightRecord({ id: "w-1", timestamp: 3000 }));
    await db.bloodPressureRecords.add(
      makeBloodPressureRecord({ id: "bp-1", timestamp: 4000 })
    );
    await db.dailyNotes.add(makeDailyNote({ id: "n-1" }));
    await db.inventoryItems.add(makeInventoryItem("rx-stats", { id: "inv-1" }));

    const stats = await getBackupStats();
    expect(stats.intakeCount).toBe(2);
    expect(stats.weightCount).toBe(1);
    expect(stats.bpCount).toBe(1);
    expect(stats.dailyNoteCount).toBe(1);
    expect(stats.inventoryItemCount).toBe(1);
    expect(stats.totalCount).toBe(6);
    expect(stats.oldestRecord?.getTime()).toBe(1000);
    expect(stats.newestRecord?.getTime()).toBe(5000);
  });
});

describe("backup-service: generateBackupFilename", () => {
  it("produces a filename of the form intake-tracker-backup-YYYY-MM-DD.json", async () => {
    const filename = generateBackupFilename();
    expect(filename).toMatch(/^intake-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("uses today's UTC date", async () => {
    const dateSpy = vi
      .spyOn(Date.prototype, "toISOString")
      .mockReturnValue("2025-12-25T00:00:00.000Z");
    try {
      expect(generateBackupFilename()).toBe(
        "intake-tracker-backup-2025-12-25.json"
      );
    } finally {
      dateSpy.mockRestore();
    }
  });
});

describe("backup-service: exportBackup", () => {
  it("returns a JSON blob with all required top-level fields", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "exp-1" }));

    const blob = await exportBackup();
    expect(blob.type).toBe("application/json");
    const parsed = JSON.parse(await blob.text());

    expect(parsed.version).toBeTypeOf("number");
    expect(parsed.exportedAt).toBeTypeOf("string");
    expect(Array.isArray(parsed.intakeRecords)).toBe(true);
    expect(parsed.intakeRecords.find((r: { id: string }) => r.id === "exp-1")).toBeTruthy();
  });
});

