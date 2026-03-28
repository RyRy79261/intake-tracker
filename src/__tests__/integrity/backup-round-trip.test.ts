import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { exportBackup, importBackup, type BackupData } from "@/lib/backup-service";
import {
  makeIntakeRecord, makeWeightRecord, makeBloodPressureRecord, makeEatingRecord,
  makeUrinationRecord, makeDefecationRecord, makeSubstanceRecord, makePrescription,
  makeMedicationPhase, makePhaseSchedule, makeInventoryItem, makeInventoryTransaction,
  makeDoseLog, makeTitrationPlan, makeDailyNote, makeAuditLog,
} from "@/__tests__/fixtures/db-fixtures";

async function blobToBackupData(blob: Blob): Promise<BackupData> {
  const text = await blob.text();
  return JSON.parse(text) as BackupData;
}

function backupDataToFile(data: BackupData): File {
  const json = JSON.stringify(data, null, 2);
  return new File([json], "test-backup.json", { type: "application/json" });
}

describe("backup round-trip: deep field equality", () => {
  beforeEach(async () => {
    await Promise.all([
      db.intakeRecords.clear(),
      db.weightRecords.clear(),
      db.bloodPressureRecords.clear(),
      db.eatingRecords.clear(),
      db.urinationRecords.clear(),
      db.defecationRecords.clear(),
      db.substanceRecords.clear(),
      db.prescriptions.clear(),
      db.medicationPhases.clear(),
      db.phaseSchedules.clear(),
      db.inventoryItems.clear(),
      db.inventoryTransactions.clear(),
      db.doseLogs.clear(),
      db.titrationPlans.clear(),
      db.dailyNotes.clear(),
      db.auditLogs.clear(),
    ]);
  });

  it("deep equality: every field survives export -> import round-trip", async () => {
    // Create fixture records with FK dependencies
    const prescription = makePrescription();
    const phase = makeMedicationPhase(prescription.id);
    const schedule = makePhaseSchedule(phase.id);
    const invItem = makeInventoryItem(prescription.id);

    // Build records map -- intakeRecords has 2 records (water + salt) to verify multi-record survival
    const fixtures: Record<string, { records: unknown[]; table: any }> = {
      intakeRecords: { records: [makeIntakeRecord(), makeIntakeRecord({ type: "salt", amount: 500 })], table: db.intakeRecords },
      weightRecords: { records: [makeWeightRecord()], table: db.weightRecords },
      bloodPressureRecords: { records: [makeBloodPressureRecord()], table: db.bloodPressureRecords },
      eatingRecords: { records: [makeEatingRecord()], table: db.eatingRecords },
      urinationRecords: { records: [makeUrinationRecord()], table: db.urinationRecords },
      defecationRecords: { records: [makeDefecationRecord()], table: db.defecationRecords },
      substanceRecords: { records: [makeSubstanceRecord()], table: db.substanceRecords },
      prescriptions: { records: [prescription], table: db.prescriptions },
      medicationPhases: { records: [phase], table: db.medicationPhases },
      phaseSchedules: { records: [schedule], table: db.phaseSchedules },
      inventoryItems: { records: [invItem], table: db.inventoryItems },
      inventoryTransactions: { records: [makeInventoryTransaction(invItem.id)], table: db.inventoryTransactions },
      doseLogs: { records: [makeDoseLog(prescription.id, phase.id, schedule.id)], table: db.doseLogs },
      titrationPlans: { records: [makeTitrationPlan()], table: db.titrationPlans },
      dailyNotes: { records: [makeDailyNote()], table: db.dailyNotes },
      auditLogs: { records: [makeAuditLog()], table: db.auditLogs },
    };

    // Insert all records
    for (const { records, table } of Object.values(fixtures)) {
      await table.bulkAdd(records);
    }

    // Export
    const blob = await exportBackup();

    // Clear all 16 tables
    for (const { table } of Object.values(fixtures)) {
      await table.clear();
    }

    // Verify tables are empty
    expect(await db.intakeRecords.count()).toBe(0);
    expect(await db.prescriptions.count()).toBe(0);

    // Import
    const backupData = await blobToBackupData(blob);
    const file = backupDataToFile(backupData);
    const importResult = await importBackup(file, "replace");
    expect(importResult.success).toBe(true);
    if (!importResult.success) throw new Error("Expected success");

    // Deep equality verification -- check every fixture record by ID lookup
    for (const [tableName, { records: originals, table }] of Object.entries(fixtures)) {
      const restored = await table.toArray();
      for (const original of originals) {
        const originalWithId = original as { id: string };
        const match = restored.find((r: any) => r.id === originalWithId.id);
        expect(match, [
          `x [Backup Round-Trip]: Record ${originalWithId.id} missing from ${tableName} after round-trip`,
          `  Fix: Check exportBackup() and importBackup() in src/lib/backup-service.ts`,
        ].join("\n")).toBeDefined();
        // Deep field equality via JSON.stringify (per D-08)
        expect(JSON.stringify(match), [
          `x [Backup Round-Trip]: Field mismatch in ${tableName} record ${originalWithId.id}`,
          `  Expected: ${JSON.stringify(original)}`,
          `  Got:      ${JSON.stringify(match)}`,
          `  Fix: Check that exportBackup/importBackup preserve all fields for ${tableName}`,
        ].join("\n")).toBe(JSON.stringify(original));
      }
    }
  });

  it("audit log edge case: fixture audit logs survive despite export side effect", async () => {
    // exportBackup() calls logAudit("data_export") which adds an extra audit log record.
    // Verify that our fixture audit log records survive by ID lookup (the extra record is ignored).
    const fixtureAuditLog = makeAuditLog();
    await db.auditLogs.add(fixtureAuditLog);

    // Export (this creates an additional audit log via logAudit)
    const blob = await exportBackup();

    // Clear and import
    await db.auditLogs.clear();
    const backupData = await blobToBackupData(blob);
    const file = backupDataToFile(backupData);
    const importResult = await importBackup(file, "replace");
    expect(importResult.success).toBe(true);
    if (!importResult.success) throw new Error("Expected success");

    // Our fixture record should exist by ID
    const restored = await db.auditLogs.toArray();
    const match = restored.find((r: any) => r.id === fixtureAuditLog.id);
    expect(match, [
      `x [Backup Round-Trip]: Fixture audit log ${fixtureAuditLog.id} missing after round-trip`,
      `  Fix: Audit log export/import may be filtering records incorrectly`,
    ].join("\n")).toBeDefined();

    // Deep equality on the fixture record
    expect(JSON.stringify(match), [
      `x [Backup Round-Trip]: Field mismatch in auditLogs record ${fixtureAuditLog.id}`,
      `  Expected: ${JSON.stringify(fixtureAuditLog)}`,
      `  Got:      ${JSON.stringify(match)}`,
      `  Fix: Check that exportBackup/importBackup preserve all fields for auditLogs`,
    ].join("\n")).toBe(JSON.stringify(fixtureAuditLog));

    // The restored set should have more records than just our fixture (due to export side effect)
    // but we don't assert exact count -- we only care that our fixture survived
    expect(restored.length).toBeGreaterThanOrEqual(1);
  });

  it("multiple records per table: both water and salt intake records survive with field equality", async () => {
    const water = makeIntakeRecord({ type: "water", amount: 250 });
    const salt = makeIntakeRecord({ type: "salt", amount: 500 });
    await db.intakeRecords.bulkAdd([water, salt]);

    // Export
    const blob = await exportBackup();

    // Clear and import
    await db.intakeRecords.clear();
    await db.auditLogs.clear(); // clear audit logs from export side effect
    const backupData = await blobToBackupData(blob);
    const file = backupDataToFile(backupData);
    const importResult = await importBackup(file, "replace");
    expect(importResult.success).toBe(true);
    if (!importResult.success) throw new Error("Expected success");

    // Both records should survive
    const restored = await db.intakeRecords.toArray();
    expect(restored).toHaveLength(2);

    // Verify each by ID with deep equality
    for (const original of [water, salt]) {
      const match = restored.find((r: any) => r.id === original.id);
      expect(match, [
        `x [Backup Round-Trip]: Record ${original.id} (type=${original.type}) missing from intakeRecords`,
        `  Fix: Check exportBackup() handles multiple records per table correctly`,
      ].join("\n")).toBeDefined();
      expect(JSON.stringify(match), [
        `x [Backup Round-Trip]: Field mismatch in intakeRecords record ${original.id}`,
        `  Expected: ${JSON.stringify(original)}`,
        `  Got:      ${JSON.stringify(match)}`,
        `  Fix: Check that exportBackup/importBackup preserve all fields for intakeRecords`,
      ].join("\n")).toBe(JSON.stringify(original));
    }
  });
});
