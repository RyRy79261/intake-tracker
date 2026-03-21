import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  exportBackup,
  importBackup,
  resolveConflicts,
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

async function blobToBackupData(blob: Blob): Promise<BackupData> {
  const text = await blob.text();
  return JSON.parse(text) as BackupData;
}

function backupDataToFile(data: BackupData): File {
  const json = JSON.stringify(data, null, 2);
  return new File([json], "test-backup.json", { type: "application/json" });
}

describe("backup-service", () => {
  beforeEach(async () => {
    // setup.ts handles db.delete()/db.open() but we also clear all tables explicitly
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

  it("exportBackup includes all 16 tables", async () => {
    // Insert one record into each table
    const intake = makeIntakeRecord();
    const weight = makeWeightRecord();
    const bp = makeBloodPressureRecord();
    const eating = makeEatingRecord();
    const urination = makeUrinationRecord();
    const defecation = makeDefecationRecord();
    const substance = makeSubstanceRecord();
    const prescription = makePrescription();
    const phase = makeMedicationPhase(prescription.id);
    const schedule = makePhaseSchedule(phase.id);
    const invItem = makeInventoryItem(prescription.id);
    const invTxn = makeInventoryTransaction(invItem.id);
    const doseLog = makeDoseLog(prescription.id, phase.id, schedule.id);
    const titrationPlan = makeTitrationPlan();
    const dailyNote = makeDailyNote();
    const auditLog = makeAuditLog();

    await Promise.all([
      db.intakeRecords.add(intake),
      db.weightRecords.add(weight),
      db.bloodPressureRecords.add(bp),
      db.eatingRecords.add(eating),
      db.urinationRecords.add(urination),
      db.defecationRecords.add(defecation),
      db.substanceRecords.add(substance),
      db.prescriptions.add(prescription),
      db.medicationPhases.add(phase),
      db.phaseSchedules.add(schedule),
      db.inventoryItems.add(invItem),
      db.inventoryTransactions.add(invTxn),
      db.doseLogs.add(doseLog),
      db.titrationPlans.add(titrationPlan),
      db.dailyNotes.add(dailyNote),
      db.auditLogs.add(auditLog),
    ]);

    const blob = await exportBackup();
    const data = await blobToBackupData(blob);

    expect(data.version).toBe(5);
    expect(data.intakeRecords).toHaveLength(1);
    expect(data.weightRecords).toHaveLength(1);
    expect(data.bloodPressureRecords).toHaveLength(1);
    expect(data.eatingRecords).toHaveLength(1);
    expect(data.urinationRecords).toHaveLength(1);
    expect(data.defecationRecords).toHaveLength(1);
    expect(data.substanceRecords).toHaveLength(1);
    expect(data.prescriptions).toHaveLength(1);
    expect(data.medicationPhases).toHaveLength(1);
    expect(data.phaseSchedules).toHaveLength(1);
    expect(data.inventoryItems).toHaveLength(1);
    expect(data.inventoryTransactions).toHaveLength(1);
    expect(data.doseLogs).toHaveLength(1);
    expect(data.titrationPlans).toHaveLength(1);
    expect(data.dailyNotes).toHaveLength(1);
    // auditLogs may have extra records from exportBackup's own logAudit call
    expect(data.auditLogs!.length).toBeGreaterThanOrEqual(1);

    // Verify IDs match
    expect(data.intakeRecords[0].id).toBe(intake.id);
    expect(data.prescriptions![0].id).toBe(prescription.id);
    expect(data.titrationPlans![0].id).toBe(titrationPlan.id);
  });

  it("round-trip: export -> clear -> import -> verify", async () => {
    // Insert records across all 16 tables
    const prescription = makePrescription({ genericName: "Lisinopril" });
    const phase = makeMedicationPhase(prescription.id);
    const schedule = makePhaseSchedule(phase.id);
    const invItem = makeInventoryItem(prescription.id);

    const records = {
      intakeRecords: [makeIntakeRecord(), makeIntakeRecord({ type: "salt", amount: 500 })],
      weightRecords: [makeWeightRecord()],
      bpRecords: [makeBloodPressureRecord()],
      eatingRecords: [makeEatingRecord()],
      urinationRecords: [makeUrinationRecord()],
      defecationRecords: [makeDefecationRecord()],
      substanceRecords: [makeSubstanceRecord()],
      prescriptions: [prescription],
      phases: [phase],
      schedules: [schedule],
      invItems: [invItem],
      invTxns: [makeInventoryTransaction(invItem.id)],
      doseLogs: [makeDoseLog(prescription.id, phase.id, schedule.id)],
      titrationPlans: [makeTitrationPlan()],
      dailyNotes: [makeDailyNote()],
      auditLogs: [makeAuditLog()],
    };

    // Insert all records
    await Promise.all([
      db.intakeRecords.bulkAdd(records.intakeRecords),
      db.weightRecords.bulkAdd(records.weightRecords),
      db.bloodPressureRecords.bulkAdd(records.bpRecords),
      db.eatingRecords.bulkAdd(records.eatingRecords),
      db.urinationRecords.bulkAdd(records.urinationRecords),
      db.defecationRecords.bulkAdd(records.defecationRecords),
      db.substanceRecords.bulkAdd(records.substanceRecords),
      db.prescriptions.bulkAdd(records.prescriptions),
      db.medicationPhases.bulkAdd(records.phases),
      db.phaseSchedules.bulkAdd(records.schedules),
      db.inventoryItems.bulkAdd(records.invItems),
      db.inventoryTransactions.bulkAdd(records.invTxns),
      db.doseLogs.bulkAdd(records.doseLogs),
      db.titrationPlans.bulkAdd(records.titrationPlans),
      db.dailyNotes.bulkAdd(records.dailyNotes),
      db.auditLogs.bulkAdd(records.auditLogs),
    ]);

    // Export
    const blob = await exportBackup();

    // Clear ALL tables
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

    // Verify empty
    expect(await db.intakeRecords.count()).toBe(0);
    expect(await db.prescriptions.count()).toBe(0);

    // Import
    const backupData = await blobToBackupData(blob);
    const file = backupDataToFile(backupData);
    const importResult = await importBackup(file, "replace");
    expect(importResult.data?.success).toBe(true);

    // Verify counts match originals
    expect(await db.intakeRecords.count()).toBe(records.intakeRecords.length);
    expect(await db.weightRecords.count()).toBe(records.weightRecords.length);
    expect(await db.bloodPressureRecords.count()).toBe(records.bpRecords.length);
    expect(await db.eatingRecords.count()).toBe(records.eatingRecords.length);
    expect(await db.urinationRecords.count()).toBe(records.urinationRecords.length);
    expect(await db.defecationRecords.count()).toBe(records.defecationRecords.length);
    expect(await db.substanceRecords.count()).toBe(records.substanceRecords.length);
    expect(await db.prescriptions.count()).toBe(records.prescriptions.length);
    expect(await db.medicationPhases.count()).toBe(records.phases.length);
    expect(await db.phaseSchedules.count()).toBe(records.schedules.length);
    expect(await db.inventoryItems.count()).toBe(records.invItems.length);
    expect(await db.inventoryTransactions.count()).toBe(records.invTxns.length);
    expect(await db.doseLogs.count()).toBe(records.doseLogs.length);
    expect(await db.titrationPlans.count()).toBe(records.titrationPlans.length);
    expect(await db.dailyNotes.count()).toBe(records.dailyNotes.length);

    // Spot-check: verify prescription genericName matches
    const restored = await db.prescriptions.get(prescription.id);
    expect(restored?.genericName).toBe("Lisinopril");
  });

  it("merge import: new records added, duplicates skipped", async () => {
    // Insert 2 prescriptions locally
    const p1 = makePrescription({ genericName: "Drug A" });
    const p2 = makePrescription({ genericName: "Drug B" });
    await db.prescriptions.bulkAdd([p1, p2]);

    // Create backup with those 2 plus 1 new
    const p3 = makePrescription({ genericName: "Drug C" });
    const backupData: BackupData = {
      version: 5,
      exportedAt: new Date().toISOString(),
      intakeRecords: [],
      weightRecords: [],
      bloodPressureRecords: [],
      prescriptions: [p1, p2, p3],
    };

    const file = backupDataToFile(backupData);
    const result = await importBackup(file, "merge");

    expect(result.data?.success).toBe(true);
    expect(result.data?.prescriptionsImported).toBe(1); // only p3
    expect(result.data?.skipped).toBeGreaterThanOrEqual(2); // p1 and p2 skipped as duplicates
    expect(result.data?.conflicts).toHaveLength(0); // identical records are not conflicts
    expect(await db.prescriptions.count()).toBe(3);
  });

  it("merge import: conflicts detected for different content", async () => {
    // Insert prescription locally
    const localRx = makePrescription({ genericName: "Metoprolol" });
    await db.prescriptions.add(localRx);

    // Create backup with same ID but different genericName
    const backupRx = { ...localRx, genericName: "Metoprolol Succinate" };
    const backupData: BackupData = {
      version: 5,
      exportedAt: new Date().toISOString(),
      intakeRecords: [],
      weightRecords: [],
      bloodPressureRecords: [],
      prescriptions: [backupRx],
    };

    const file = backupDataToFile(backupData);
    const result = await importBackup(file, "merge");

    expect(result.data?.success).toBe(true);
    expect(result.data?.conflicts).toHaveLength(1);
    expect(result.data?.conflicts[0].table).toBe("prescriptions");
    expect(result.data?.conflicts[0].id).toBe(localRx.id);
    expect((result.data?.conflicts[0].current as { genericName: string }).genericName).toBe("Metoprolol");
    expect((result.data?.conflicts[0].backup as { genericName: string }).genericName).toBe("Metoprolol Succinate");
    expect(result.data?.prescriptionsImported).toBe(0); // conflict not auto-imported
  });

  it("resolveConflicts applies backup data when useBackup=true", async () => {
    // Set up a conflict
    const localRx = makePrescription({ genericName: "Metoprolol" });
    await db.prescriptions.add(localRx);

    const backupRx = { ...localRx, genericName: "Metoprolol Succinate" };
    const backupData: BackupData = {
      version: 5,
      exportedAt: new Date().toISOString(),
      intakeRecords: [],
      weightRecords: [],
      bloodPressureRecords: [],
      prescriptions: [backupRx],
    };

    const file = backupDataToFile(backupData);
    const importResult = await importBackup(file, "merge");
    expect(importResult.data?.conflicts).toHaveLength(1);

    // Resolve: use backup version
    const resolveResult = await resolveConflicts([
      {
        table: "prescriptions",
        id: localRx.id,
        useBackup: true,
        backupRecord: backupRx as unknown as Record<string, unknown>,
      },
    ]);

    expect(resolveResult.data?.resolved).toBe(1);

    // Verify the local record now has backup content
    const updated = await db.prescriptions.get(localRx.id);
    expect(updated?.genericName).toBe("Metoprolol Succinate");
  });

  it("v4 backup imports successfully with empty medication tables", async () => {
    // Create a v4-shaped backup (no medication fields)
    const v4Backup = {
      version: 4,
      exportedAt: new Date().toISOString(),
      intakeRecords: [makeIntakeRecord()],
      weightRecords: [],
      bloodPressureRecords: [],
      eatingRecords: [],
      urinationRecords: [],
      defecationRecords: [],
      substanceRecords: [],
    };

    const file = new File([JSON.stringify(v4Backup)], "v4-backup.json", {
      type: "application/json",
    });
    const result = await importBackup(file, "merge");

    expect(result.data?.success).toBe(true);
    expect(result.data?.intakeImported).toBe(1);
    expect(result.data?.prescriptionsImported).toBe(0);
    expect(result.data?.phasesImported).toBe(0);
    expect(result.data?.errors).toHaveLength(0);
  });

  it("replace mode clears all 16 tables", async () => {
    // Insert records in all 16 tables
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

    // Create minimal backup with 1 intake record only
    const backupData: BackupData = {
      version: 5,
      exportedAt: new Date().toISOString(),
      intakeRecords: [makeIntakeRecord()],
      weightRecords: [],
      bloodPressureRecords: [],
    };

    const file = backupDataToFile(backupData);
    const result = await importBackup(file, "replace");

    expect(result.data?.success).toBe(true);
    expect(result.data?.intakeImported).toBe(1);

    // All original records should be gone
    expect(await db.prescriptions.count()).toBe(0);
    expect(await db.medicationPhases.count()).toBe(0);
    expect(await db.phaseSchedules.count()).toBe(0);
    expect(await db.inventoryItems.count()).toBe(0);
    expect(await db.inventoryTransactions.count()).toBe(0);
    expect(await db.doseLogs.count()).toBe(0);
    expect(await db.titrationPlans.count()).toBe(0);
    expect(await db.dailyNotes.count()).toBe(0);
    expect(await db.weightRecords.count()).toBe(0);
    expect(await db.substanceRecords.count()).toBe(0);
  });
});
