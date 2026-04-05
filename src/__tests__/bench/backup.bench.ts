import "fake-indexeddb/auto";
import { bench, describe, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { exportBackup, importBackup } from "@/lib/backup-service";
import {
  makeIntakeRecord, makeWeightRecord, makeBloodPressureRecord, makeEatingRecord,
  makeUrinationRecord, makeDefecationRecord, makeSubstanceRecord, makePrescription,
  makeMedicationPhase, makePhaseSchedule, makeInventoryItem, makeInventoryTransaction,
  makeDoseLog, makeTitrationPlan, makeDailyNote, makeAuditLog,
} from "@/__tests__/fixtures/db-fixtures";

async function blobToBackupData(blob: Blob) {
  const text = await blob.text();
  return JSON.parse(text);
}

function backupDataToFile(data: unknown): File {
  const json = JSON.stringify(data, null, 2);
  return new File([json], "bench-backup.json", { type: "application/json" });
}

describe("backup round-trip", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.close();
    await db.delete();
  });

  bench(
    "export + import all 16 tables",
    async () => {
      // Seed one record per table (FK dependencies respected)
      const prescription = makePrescription();
      const phase = makeMedicationPhase(prescription.id);
      const schedule = makePhaseSchedule(phase.id);
      const invItem = makeInventoryItem(prescription.id);

      await Promise.all([
        db.intakeRecords.add(makeIntakeRecord()),
        db.weightRecords.add(makeWeightRecord()),
        db.bloodPressureRecords.add(makeBloodPressureRecord()),
        db.eatingRecords.add(makeEatingRecord()),
        db.urinationRecords.add(makeUrinationRecord()),
        db.defecationRecords.add(makeDefecationRecord()),
        db.substanceRecords.add(makeSubstanceRecord()),
        db.prescriptions.add(prescription),
        db.medicationPhases.add(phase),
        db.phaseSchedules.add(schedule),
        db.inventoryItems.add(invItem),
        db.inventoryTransactions.add(makeInventoryTransaction(invItem.id)),
        db.doseLogs.add(makeDoseLog(prescription.id, phase.id, schedule.id)),
        db.titrationPlans.add(makeTitrationPlan()),
        db.dailyNotes.add(makeDailyNote()),
        db.auditLogs.add(makeAuditLog()),
      ]);

      // Export
      const blob = await exportBackup();

      // Clear all tables
      await Promise.all([
        db.intakeRecords.clear(), db.weightRecords.clear(),
        db.bloodPressureRecords.clear(), db.eatingRecords.clear(),
        db.urinationRecords.clear(), db.defecationRecords.clear(),
        db.substanceRecords.clear(), db.prescriptions.clear(),
        db.medicationPhases.clear(), db.phaseSchedules.clear(),
        db.inventoryItems.clear(), db.inventoryTransactions.clear(),
        db.doseLogs.clear(), db.titrationPlans.clear(),
        db.dailyNotes.clear(), db.auditLogs.clear(),
      ]);

      // Import
      const backupData = await blobToBackupData(blob);
      const file = backupDataToFile(backupData);
      await importBackup(file, "replace");
    },
    { time: 2000, iterations: 5, warmupIterations: 1 }
  );
});
