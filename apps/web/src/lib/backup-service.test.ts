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
 *   - An encrypted file (a format the app no longer reads) is refused.
 *   - Legacy v1 backup shape (records[] instead of intakeRecords[]).
 *   - Merge-mode conflict detection vs same-content skip.
 *   - Replace mode tombstoning existing rows in one transaction.
 *   - resolveConflicts overwrite / keep semantics.
 *   - Restores over tombstones, sync enqueueing, legacy row normalisation.
 *   - generateBackupFilename format.
 */

import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import * as backupService from "@/lib/backup-service";
import {
  exportBackup,
  importBackup,
  resolveConflicts,
  generateBackupFilename,
} from "@/lib/backup-service";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makePrescription,
  makeDoseLog,
  makeUserProfile,
  makeInsightReport,
  makeUserSettings,
} from "@/__tests__/fixtures/db-fixtures";
import { mergeSettingsRows } from "@/lib/settings-merge";

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

describe("backup-service: encrypted files", () => {
  it("refuses an encrypted backup file with a clear error", async () => {
    const body = JSON.stringify({
      encrypted: true,
      payload: { iv: "x", salt: "y", data: "z", version: 1 },
      version: 5,
    });
    const res = await importBackup(makeFile(body));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.errors[0]).toMatch(/encrypted/i);
    expect(res.data.errors[0]).not.toMatch(/importEncryptedBackup/);
    expect(res.data.success).toBe(false);
  });

  it("no longer offers encrypted export or import", () => {
    expect("exportEncryptedBackup" in backupService).toBe(false);
    expect("importEncryptedBackup" in backupService).toBe(false);
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
  it("tombstones and enqueues local rows the backup does not contain", async () => {
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

    // Pre-existing rows are tombstoned (so the deletion syncs), only the
    // imported one stays live.
    const live = (await db.intakeRecords.toArray()).filter((r) => r.deletedAt === null);
    expect(live.map((r) => r.id)).toEqual(["new-1"]);
    expect((await db.intakeRecords.get("pre-1"))?.deletedAt).toBeTypeOf("number");
    expect((await db.intakeRecords.get("new-1"))?.amount).toBe(500);
    const pre1 = await db._syncQueue
      .where("[tableName+recordId]")
      .equals(["intakeRecords", "pre-1"])
      .first();
    expect(pre1?.op).toBe("delete");

    // Empty arrays in the backup mean the table ends with no live rows.
    expect((await db.weightRecords.get("old-weight"))?.deletedAt).toBeTypeOf("number");
  });

  it("leaves tables the backup file has no key for untouched", async () => {
    // An older backup that predates a table (no `userProfile` / `doseLogs`
    // key at all) says nothing about it, so replace must not wipe it.
    await db.userProfile.add(makeUserProfile({ id: "profile" }));
    await db.doseLogs.add(makeDoseLog("rx", "ph", "sch", { id: "dose" }));

    const res = await importBackup(makeFile(makeBackupJson()), "replace");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.success).toBe(true);

    expect((await db.userProfile.get("profile"))?.deletedAt).toBeNull();
    expect((await db.doseLogs.get("dose"))?.deletedAt).toBeNull();
    expect(await db._syncQueue.count()).toBe(0);
  });

  it("rolls back everything when the import fails midway", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "survivor" }));
    // Every Dexie table shares one Table prototype; fail only weight writes.
    type Put = (this: { name: string }, ...args: unknown[]) => Promise<unknown>;
    const tableProto = Object.getPrototypeOf(db.weightRecords) as { put: Put };
    const realPut = tableProto.put;
    const put = vi.spyOn(tableProto, "put").mockImplementation(function (this: { name: string }, ...args) {
      if (this.name === "weightRecords") return Promise.reject(new Error("disk full"));
      return realPut.apply(this, args);
    });
    try {
      const body = makeBackupJson({
        intakeRecords: [makeIntakeRecord({ id: "incoming" })],
        weightRecords: [makeWeightRecord({ id: "w-in" })],
      });
      const res = await importBackup(makeFile(body), "replace");
      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data.success).toBe(false);
      expect(res.data.errors.length).toBeGreaterThan(0);
    } finally {
      put.mockRestore();
    }

    expect((await db.intakeRecords.get("survivor"))?.deletedAt).toBeNull();
    expect(await db.intakeRecords.get("incoming")).toBeUndefined();
    expect(await db._syncQueue.count()).toBe(0);
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

// ─────────────────────────────────────────────────────────────────────────
// Restore correctness (audit analytics-history-export#3/#4/#20,
// server-schema-parity#4, gap-records-history-listing#2).
// ─────────────────────────────────────────────────────────────────────────

async function queued(tableName: string, recordId: string) {
  return db._syncQueue
    .where("[tableName+recordId]")
    .equals([tableName, recordId])
    .first();
}

describe("backup-service: restoring over deleted records", () => {
  it("restores a health record whose local copy is tombstoned", async () => {
    await db.intakeRecords.add(
      makeIntakeRecord({ id: "gone", amount: 250, deletedAt: 5000, updatedAt: 5000 }),
    );
    const body = makeBackupJson({
      intakeRecords: [makeIntakeRecord({ id: "gone", amount: 250, updatedAt: 1000 })],
    });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.intakeImported).toBe(1);
    expect(res.data.skipped).toBe(0);

    const stored = await db.intakeRecords.get("gone");
    expect(stored?.deletedAt).toBeNull();
    // Newer than the local tombstone, so last-write-wins keeps the restore.
    expect(stored!.updatedAt).toBeGreaterThan(5000);
    expect((await queued("intakeRecords", "gone"))?.op).toBe("upsert");
  });

  it("restores a medication record whose local copy is tombstoned, without a conflict", async () => {
    await db.prescriptions.add(
      makePrescription({ id: "rx-del", genericName: "Furosemide", deletedAt: 5000, updatedAt: 5000 }),
    );
    const body = makeBackupJson({
      prescriptions: [makePrescription({ id: "rx-del", genericName: "Furosemide" })],
    });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.prescriptionsImported).toBe(1);
    expect(res.data.conflicts).toHaveLength(0);
    expect((await db.prescriptions.get("rx-del"))?.deletedAt).toBeNull();
    expect((await queued("prescriptions", "rx-del"))?.op).toBe("upsert");
  });

  it("reports a conflict when the backup holds a tombstone of a live local record", async () => {
    const rx = makePrescription({ id: "rx-live", genericName: "Same" });
    await db.prescriptions.add(rx);
    const body = makeBackupJson({ prescriptions: [{ ...rx, deletedAt: 9000 }] });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.conflicts).toHaveLength(1);
    expect((await db.prescriptions.get("rx-live"))?.deletedAt).toBeNull();
  });

  it("skips a tombstone when the local copy is tombstoned too", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "both", deletedAt: 5000 }));
    const body = makeBackupJson({
      intakeRecords: [makeIntakeRecord({ id: "both", deletedAt: 4000 })],
    });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.intakeImported).toBe(0);
    expect(res.data.skipped).toBe(1);
    expect(await queued("intakeRecords", "both")).toBeUndefined();
  });
});

describe("backup-service: imported rows reach sync", () => {
  it("enqueues an upsert for every newly imported live row", async () => {
    const body = makeBackupJson({
      intakeRecords: [makeIntakeRecord({ id: "new-sync" })],
      prescriptions: [makePrescription({ id: "rx-sync" })],
    });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    expect((await queued("intakeRecords", "new-sync"))?.op).toBe("upsert");
    expect((await queued("prescriptions", "rx-sync"))?.op).toBe("upsert");
  });

  it("keeps a new row's own updatedAt so a newer server copy still wins", async () => {
    const body = makeBackupJson({
      intakeRecords: [makeIntakeRecord({ id: "keep-ts", updatedAt: 1234 })],
    });

    await importBackup(makeFile(body), "merge");
    expect((await db.intakeRecords.get("keep-ts"))?.updatedAt).toBe(1234);
  });

  it("stores a backup tombstone for an unknown id without pushing it", async () => {
    const body = makeBackupJson({
      intakeRecords: [makeIntakeRecord({ id: "old-tomb", deletedAt: 4000 })],
    });

    await importBackup(makeFile(body), "merge");
    expect((await db.intakeRecords.get("old-tomb"))?.deletedAt).toBe(4000);
    expect(await queued("intakeRecords", "old-tomb")).toBeUndefined();
  });

  it("resolveConflicts writes the backup version with a fresh updatedAt and enqueues it", async () => {
    await db.prescriptions.add(
      makePrescription({ id: "rx-res", genericName: "Old", updatedAt: 9000 }),
    );
    const backupRecord = makePrescription({
      id: "rx-res",
      genericName: "FromBackup",
      updatedAt: 1000,
    }) as unknown as Record<string, unknown>;

    const res = await resolveConflicts([
      { table: "prescriptions", id: "rx-res", useBackup: true, backupRecord },
    ]);
    expect(res.success).toBe(true);
    const stored = await db.prescriptions.get("rx-res");
    expect(stored?.genericName).toBe("FromBackup");
    expect(stored!.updatedAt).toBeGreaterThan(9000);
    expect((await queued("prescriptions", "rx-res"))?.op).toBe("upsert");
  });

  it("resolveConflicts enqueues a delete when the chosen backup version is a tombstone", async () => {
    await db.prescriptions.add(makePrescription({ id: "rx-tomb" }));
    const backupRecord = makePrescription({
      id: "rx-tomb",
      deletedAt: 5000,
    }) as unknown as Record<string, unknown>;

    await resolveConflicts([
      { table: "prescriptions", id: "rx-tomb", useBackup: true, backupRecord },
    ]);
    expect((await db.prescriptions.get("rx-tomb"))?.deletedAt).toBe(5000);
    expect((await queued("prescriptions", "rx-tomb"))?.op).toBe("delete");
  });
});

describe("backup-service: legacy rows without sync fields", () => {
  it("normalises missing sync fields so imported rows are visible", async () => {
    const body = JSON.stringify({
      version: 1,
      records: [{ id: "legacy-bare", type: "water", amount: 500, timestamp: 1_700_000_000_000 }],
    });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    const stored = await db.intakeRecords.get("legacy-bare");
    expect(stored?.deletedAt).toBeNull();
    expect(stored?.createdAt).toBe(1_700_000_000_000);
    expect(typeof stored?.updatedAt).toBe("number");
    expect(typeof stored?.deviceId).toBe("string");
    expect(typeof stored?.timezone).toBe("string");
  });

  it("does not add a timezone to tables that have no timezone column", async () => {
    const rx = makePrescription({ id: "rx-no-tz" }) as unknown as Record<string, unknown>;
    delete rx.deletedAt;
    const body = makeBackupJson({ prescriptions: [rx] });

    await importBackup(makeFile(body), "merge");
    const stored = (await db.prescriptions.get("rx-no-tz")) as unknown as Record<string, unknown>;
    expect(stored.deletedAt).toBeNull();
    expect("timezone" in stored).toBe(false);
  });
});

describe("backup-service: records the old validators dropped", () => {
  it("imports potassium intakes and PRN doses without a phase or schedule", async () => {
    const prn = makeDoseLog("rx-prn", "unused", "unused", { id: "prn-1" }) as unknown as Record<
      string,
      unknown
    >;
    delete prn.phaseId;
    delete prn.scheduleId;
    const body = makeBackupJson({
      intakeRecords: [makeIntakeRecord({ id: "k-1", type: "potassium", amount: 400 })],
      doseLogs: [prn, { ...prn, id: "prn-2", phaseId: null, scheduleId: null }],
    });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.intakeImported).toBe(1);
    expect(res.data.doseLogsImported).toBe(2);
    expect(res.data.skipped).toBe(0);
  });
});

describe("backup-service: import totals", () => {
  it("totalImported counts every table, including profile and insight reports", async () => {
    const body = makeBackupJson({
      intakeRecords: [makeIntakeRecord()],
      userProfile: [makeUserProfile()],
      insightReports: [makeInsightReport()],
    });

    const res = await importBackup(makeFile(body), "merge");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.totalImported).toBe(3);
  });
});

describe("backup-service: synced settings (audit state-settings-cache#2)", () => {
  it("exports the userSettings row", async () => {
    await db.userSettings.add(makeUserSettings({ id: "settings-1", waterLimit: 1800 }));

    const parsed = JSON.parse(await (await exportBackup()).text());

    expect(parsed.userSettings).toHaveLength(1);
    expect(parsed.userSettings[0].waterLimit).toBe(1800);
  });

  it("restores userSettings from a backup and queues it for sync", async () => {
    const body = makeBackupJson({
      userSettings: [makeUserSettings({ id: "settings-1", saltLimit: 2100 })],
    });

    const res = await importBackup(makeFile(body), "merge");

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.userSettingsImported).toBe(1);
    expect((await db.userSettings.get("settings-1"))!.saltLimit).toBe(2100);
    const queued = await db._syncQueue.where("tableName").equals("userSettings").count();
    expect(queued).toBe(1);
  });

  it("restores the week start, and a row from before it existed", async () => {
    const { weekStartsOn: _drop, ...legacy } = makeUserSettings({ id: "settings-2" });
    void _drop;
    const body = makeBackupJson({
      userSettings: [makeUserSettings({ id: "settings-1", weekStartsOn: 0 }), legacy],
    });

    const res = await importBackup(makeFile(body), "merge");

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.userSettingsImported).toBe(2);
    expect((await db.userSettings.get("settings-1"))!.weekStartsOn).toBe(0);
    expect((await db.userSettings.get("settings-2"))!.weekStartsOn).toBeUndefined();
  });

  it("restores the synced settings of an older backup that only has the settings blob", async () => {
    const body = makeBackupJson({
      settings: {
        state: {
          waterLimit: 1600,
          saltLimit: 1900,
          dayStartHour: 4,
          weekStartsOn: 6,
          optionalTrackers: { sugar: false, potassium: true },
          liquidPresets: [{ id: "custom-1", name: "Rooibos", tab: "beverage" }],
          // Device-only preference: not part of the synced row.
          scrollDurationMs: 900,
        },
      },
    });

    const res = await importBackup(makeFile(body), "merge");

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.userSettingsImported).toBe(1);
    const rows = await db.userSettings.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.waterLimit).toBe(1600);
    expect(rows[0]!.saltLimit).toBe(1900);
    expect(rows[0]!.dayStartHour).toBe(4);
    expect(rows[0]!.weekStartsOn).toBe(6);
    expect(rows[0]!.optionalTrackers).toEqual({ sugar: false, potassium: true });
    expect(rows[0]!.liquidPresets.map((p) => p.name)).toEqual(["Rooibos"]);
    expect(rows[0]).not.toHaveProperty("scrollDurationMs");
  });

  it("raises a conflict instead of overwriting differing local settings from an old settings blob", async () => {
    await db.userSettings.add(makeUserSettings({ id: "settings-1", waterLimit: 2500 }));
    const body = makeBackupJson({ settings: { state: { waterLimit: 1600 } } });

    const res = await importBackup(makeFile(body), "merge");

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.conflicts.map((c) => [c.table, c.id])).toEqual([
      ["userSettings", "settings-1"],
    ]);
    expect((await db.userSettings.get("settings-1"))!.waterLimit).toBe(2500);
  });
});

describe("backup-service: restored settings beat newer per-setting stamps", () => {
  // A restored settings row gets a fresh updatedAt so it wins, but settings
  // conflicts resolve per setting by fieldUpdatedAt. Keeping the backup's
  // old stamps would make every restored setting lose to the server's newer
  // stamps: the restore would show locally, never reach the server, and be
  // reverted by the next pull.
  const server = makeUserSettings({
    id: "settings-1",
    waterLimit: 2500,
    updatedAt: 5_000,
    fieldUpdatedAt: { waterLimit: 5_000 },
  });
  const backupRow = makeUserSettings({
    id: "settings-1",
    waterLimit: 1600,
    updatedAt: 1_000,
    fieldUpdatedAt: { waterLimit: 1_000 },
  });

  it("resolveConflicts: the chosen backup settings win the per-setting merge", async () => {
    await db.userSettings.add({ ...server });

    await resolveConflicts([
      { table: "userSettings", id: "settings-1", useBackup: true, backupRecord: { ...backupRow } },
    ]);

    const restored = (await db.userSettings.get("settings-1"))!;
    expect(restored.waterLimit).toBe(1600);
    const merge = mergeSettingsRows(server, restored);
    expect(merge.incomingWins).toContain("waterLimit");
    expect(merge.row.waterLimit).toBe(1600);
  });

  it("replace mode: the restored settings win the per-setting merge", async () => {
    await db.userSettings.add({ ...server });

    await importBackup(makeFile(makeBackupJson({ userSettings: [{ ...backupRow }] })), "replace");

    const restored = (await db.userSettings.get("settings-1"))!;
    expect(restored.waterLimit).toBe(1600);
    expect(mergeSettingsRows(server, restored).row.waterLimit).toBe(1600);
  });

  it("a row new to this device keeps the backup's own stamps (a newer server copy still wins)", async () => {
    await importBackup(makeFile(makeBackupJson({ userSettings: [{ ...backupRow }] })), "merge");

    const restored = (await db.userSettings.get("settings-1"))!;
    expect(restored.fieldUpdatedAt).toEqual({ waterLimit: 1_000 });
    expect(mergeSettingsRows(server, restored).row.waterLimit).toBe(2500);
  });
});
