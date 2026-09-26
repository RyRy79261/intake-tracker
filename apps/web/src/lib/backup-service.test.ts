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
 *   - The encrypted-vs-plain crossover in both importers.
 *   - Legacy v1 backup shape (records[] instead of intakeRecords[]).
 *   - Merge-mode conflict detection vs same-content skip.
 *   - Replace mode tombstoning existing rows in one transaction.
 *   - resolveConflicts overwrite / keep semantics.
 *   - Restores over tombstones, sync enqueueing, legacy row normalisation.
 *   - generateBackupFilename format.
 *   - importEncryptedBackup with the wrong PIN never corrupts the DB.
 */

import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import {
  exportBackup,
  exportEncryptedBackup,
  importBackup,
  importEncryptedBackup,
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

describe("backup-service: importBackup encrypted-vs-plain crossover", () => {
  it("surfaces a helpful error when an encrypted backup is passed to importBackup", async () => {
    const body = JSON.stringify({
      encrypted: true,
      payload: { iv: "x", salt: "y", data: "z", version: 1 },
      version: 5,
    });
    const res = await importBackup(makeFile(body));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.errors[0]).toMatch(/encrypted.*importEncryptedBackup/i);
    expect(res.data.success).toBe(false);
  });

  it("surfaces 'not an encrypted backup' when a plain backup is passed to importEncryptedBackup", async () => {
    const body = makeBackupJson();
    const res = await importEncryptedBackup(makeFile(body), "any-pin");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.errors.join(" ")).toMatch(/not an encrypted backup/i);
  });

  it("surfaces 'Invalid JSON format' when importEncryptedBackup receives garbage", async () => {
    const res = await importEncryptedBackup(makeFile("{{{"), "any-pin");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.errors).toContain("Invalid JSON format");
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

describe("backup-service: encrypted round-trip and wrong-PIN handling", () => {
  // src/lib/crypto.ts's isCryptoAvailable() guard requires globalThis.window,
  // and exportBackup → logAudit → getDeviceId reads globalThis.localStorage
  // once window is present. The node vitest env provides neither even though
  // crypto.subtle is available on globalThis. Shim both for the test, mirroring
  // the helper in src/lib/crypto.test.ts and extending it for localStorage.
  async function withWindow<T>(fn: () => Promise<T>): Promise<T> {
    const hadWindow = "window" in globalThis;
    const hadLocalStorage = "localStorage" in globalThis;
    if (!hadWindow) {
      (globalThis as { window?: unknown }).window = {
        crypto: globalThis.crypto,
      };
    }
    if (!hadLocalStorage) {
      const store = new Map<string, string>();
      (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
        get length() {
          return store.size;
        },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
      };
    }
    try {
      return await fn();
    } finally {
      if (!hadWindow) delete (globalThis as { window?: unknown }).window;
      if (!hadLocalStorage)
        delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }

  it("export → wrong-PIN import surfaces an error AND leaves the DB intact", async () => {
    await withWindow(async () => {
      // Seed pre-existing local data we want to prove isn't corrupted by the
      // failed decryption attempt.
      await db.intakeRecords.add(
        makeIntakeRecord({ id: "untouched", amount: 7 })
      );

      const encryptedBlob = await exportEncryptedBackup("correct-pin");
      const encryptedFile = new File(
        [await encryptedBlob.text()],
        "backup.json",
        { type: "application/json" }
      );

      const res = await importEncryptedBackup(
        encryptedFile,
        "wrong-pin",
        "merge"
      );
      expect(res.success).toBe(true);
      if (!res.success) return;
      // Decryption failure should surface in errors, not throw, and import
      // counters should all be zero.
      expect(res.data.errors.length).toBeGreaterThan(0);
      expect(res.data.intakeImported).toBe(0);

      // And the pre-existing record is still there with original content.
      expect((await db.intakeRecords.get("untouched"))?.amount).toBe(7);
    });
  });

  it("export → correct-PIN import imports the backup contents", async () => {
    await withWindow(async () => {
      await db.intakeRecords.add(makeIntakeRecord({ id: "enc-1", amount: 42 }));
      const encryptedBlob = await exportEncryptedBackup("vault");
      const encryptedFile = new File(
        [await encryptedBlob.text()],
        "backup.json",
        { type: "application/json" }
      );

      // Clear the table so we can prove the import re-added the record.
      await db.intakeRecords.clear();

      const res = await importEncryptedBackup(encryptedFile, "vault", "merge");
      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data.errors).toEqual([]);
      expect(res.data.intakeImported).toBe(1);
      expect((await db.intakeRecords.get("enc-1"))?.amount).toBe(42);
    });
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
