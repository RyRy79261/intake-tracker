/**
 * Comprehensive backup service for all health data.
 * Supports export/import of all 16 data tables with conflict detection.
 */

import {
  db,
  type IntakeRecord,
  type WeightRecord,
  type BloodPressureRecord,
  type EatingRecord,
  type UrinationRecord,
  type DefecationRecord,
  type SubstanceRecord,
  type Prescription,
  type MedicationPhase,
  type PhaseSchedule,
  type InventoryItem,
  type InventoryTransaction,
  type DoseLog,
  type TitrationPlan,
  type DailyNote,
  type AuditLog,
} from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { logAudit } from "./audit";
import { encrypt, decrypt, type EncryptedData } from "./crypto";

export interface BackupData {
  version: number;
  exportedAt: string;
  appVersion?: string;
  intakeRecords: IntakeRecord[];
  weightRecords: WeightRecord[];
  bloodPressureRecords: BloodPressureRecord[];
  eatingRecords?: EatingRecord[];
  urinationRecords?: UrinationRecord[];
  defecationRecords?: DefecationRecord[];
  substanceRecords?: SubstanceRecord[];
  prescriptions?: Prescription[];
  medicationPhases?: MedicationPhase[];
  phaseSchedules?: PhaseSchedule[];
  inventoryItems?: InventoryItem[];
  inventoryTransactions?: InventoryTransaction[];
  doseLogs?: DoseLog[];
  titrationPlans?: TitrationPlan[];
  dailyNotes?: DailyNote[];
  auditLogs?: AuditLog[];
  settings?: Record<string, unknown>;
}

export interface ConflictRecord {
  table: string;
  id: string;
  current: Record<string, unknown>;
  backup: Record<string, unknown>;
}

export interface ImportResult {
  success: boolean;
  intakeImported: number;
  weightImported: number;
  bpImported: number;
  eatingImported: number;
  urinationImported: number;
  defecationImported: number;
  substanceImported: number;
  prescriptionsImported: number;
  phasesImported: number;
  schedulesImported: number;
  inventoryItemsImported: number;
  inventoryTransactionsImported: number;
  doseLogsImported: number;
  titrationPlansImported: number;
  dailyNotesImported: number;
  auditLogsImported: number;
  skipped: number;
  conflicts: ConflictRecord[];
  errors: string[];
}

const CURRENT_BACKUP_VERSION = 5;

export interface EncryptedBackup {
  encrypted: true;
  payload: EncryptedData;
  version: number;
}

function emptyImportResult(): ImportResult {
  return {
    success: false,
    intakeImported: 0,
    weightImported: 0,
    bpImported: 0,
    eatingImported: 0,
    urinationImported: 0,
    defecationImported: 0,
    substanceImported: 0,
    prescriptionsImported: 0,
    phasesImported: 0,
    schedulesImported: 0,
    inventoryItemsImported: 0,
    inventoryTransactionsImported: 0,
    doseLogsImported: 0,
    titrationPlansImported: 0,
    dailyNotesImported: 0,
    auditLogsImported: 0,
    skipped: 0,
    conflicts: [],
    errors: [],
  };
}

/**
 * Compare two records ignoring sync metadata fields.
 */
const IGNORE_FIELDS = new Set(["createdAt", "updatedAt", "deletedAt", "deviceId", "timezone"]);

function isContentEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a).filter(k => !IGNORE_FIELDS.has(k));
  const bKeys = Object.keys(b).filter(k => !IGNORE_FIELDS.has(k));
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

/**
 * Export all health data to a JSON blob.
 * Read function -- returns Blob directly, lets errors propagate.
 */
export async function exportBackup(): Promise<Blob> {
  const [
    intakeRecords, weightRecords, bloodPressureRecords,
    eatingRecords, urinationRecords, defecationRecords, substanceRecords,
    prescriptions, medicationPhases, phaseSchedules,
    inventoryItems, inventoryTransactions, doseLogs,
    titrationPlans, dailyNotes, auditLogs,
  ] = await Promise.all([
    db.intakeRecords.toArray(),
    db.weightRecords.toArray(),
    db.bloodPressureRecords.toArray(),
    db.eatingRecords.toArray(),
    db.urinationRecords.toArray(),
    db.defecationRecords.toArray(),
    db.substanceRecords.toArray(),
    db.prescriptions.toArray(),
    db.medicationPhases.toArray(),
    db.phaseSchedules.toArray(),
    db.inventoryItems.toArray(),
    db.inventoryTransactions.toArray(),
    db.doseLogs.toArray(),
    db.titrationPlans.toArray(),
    db.dailyNotes.toArray(),
    db.auditLogs.toArray(),
  ]);

  // Get settings from localStorage
  let settings: Record<string, unknown> = {};
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("intake-tracker-settings");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.state) {
          settings = { state: parsed.state };
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  const backupData: BackupData = {
    version: CURRENT_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    intakeRecords,
    weightRecords,
    bloodPressureRecords,
    eatingRecords,
    urinationRecords,
    defecationRecords,
    substanceRecords,
    prescriptions,
    medicationPhases,
    phaseSchedules,
    inventoryItems,
    inventoryTransactions,
    doseLogs,
    titrationPlans,
    dailyNotes,
    auditLogs,
    settings,
  };

  logAudit(
    "data_export",
    `Exported ${intakeRecords.length} intake, ${weightRecords.length} weight, ${bloodPressureRecords.length} BP, ` +
    `${eatingRecords.length} eating, ${urinationRecords.length} urination, ${defecationRecords.length} defecation, ` +
    `${substanceRecords.length} substance, ${prescriptions.length} prescriptions, ${medicationPhases.length} phases, ` +
    `${phaseSchedules.length} schedules, ${inventoryItems.length} inventory items, ${inventoryTransactions.length} inv txns, ` +
    `${doseLogs.length} dose logs, ${titrationPlans.length} titration plans, ${dailyNotes.length} daily notes, ` +
    `${auditLogs.length} audit logs`
  );

  const json = JSON.stringify(backupData, null, 2);
  return new Blob([json], { type: "application/json" });
}

/**
 * Generate a filename for the backup
 */
export function generateBackupFilename(): string {
  const date = new Date().toISOString().split("T")[0];
  return `intake-tracker-backup-${date}.json`;
}

/**
 * Download a backup file (mutation -- keeps ServiceResult)
 */
export async function downloadBackup(): Promise<ServiceResult<void>> {
  try {
    const blob = await exportBackup();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = generateBackupFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return ok(undefined);
  } catch (e) {
    return err("Failed to download backup", e);
  }
}

/**
 * Export all health data as an encrypted JSON blob.
 * The backup data is encrypted with the user's PIN using AES-GCM.
 */
export async function exportEncryptedBackup(pin: string): Promise<Blob> {
  const plainBlob = await exportBackup();
  const json = await plainBlob.text();
  const payload = await encrypt(json, pin);

  const encryptedBackup: EncryptedBackup = {
    encrypted: true,
    payload,
    version: CURRENT_BACKUP_VERSION,
  };

  logAudit("data_export", "Exported encrypted backup");

  return new Blob([JSON.stringify(encryptedBackup, null, 2)], {
    type: "application/json",
  });
}

/**
 * Download an encrypted backup file (mutation -- keeps ServiceResult)
 */
export async function downloadEncryptedBackup(
  pin: string
): Promise<ServiceResult<void>> {
  try {
    const blob = await exportEncryptedBackup(pin);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().split("T")[0];
    a.download = `intake-tracker-backup-${date}-encrypted.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return ok(undefined);
  } catch (e) {
    return err("Failed to download encrypted backup", e);
  }
}

/**
 * Import an encrypted backup file using the user's PIN.
 * Decrypts the payload, then delegates to normal import logic.
 */
export async function importEncryptedBackup(
  file: File,
  pin: string,
  mode: "merge" | "replace" = "merge"
): Promise<ServiceResult<ImportResult>> {
  try {
    const text = await file.text();
    let outer: unknown;

    try {
      outer = JSON.parse(text);
    } catch {
      const result = emptyImportResult();
      result.errors.push("Invalid JSON format");
      return ok(result);
    }

    if (
      !outer ||
      typeof outer !== "object" ||
      !(outer as Record<string, unknown>).encrypted
    ) {
      const result = emptyImportResult();
      result.errors.push(
        "File is not an encrypted backup. Use importBackup() for unencrypted files."
      );
      return ok(result);
    }

    const encryptedBackup = outer as EncryptedBackup;
    const decryptedJson = await decrypt(encryptedBackup.payload, pin);

    // Create a new File from the decrypted JSON and delegate to importBackup
    const decryptedFile = new File([decryptedJson], file.name, {
      type: "application/json",
    });
    return importBackup(decryptedFile, mode);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown decryption error";
    const result = emptyImportResult();
    result.errors.push(message);
    return ok(result);
  }
}

/**
 * Validate backup data structure
 */
function validateBackupData(data: unknown): data is BackupData {
  if (!data || typeof data !== "object") return false;

  const backup = data as Record<string, unknown>;

  // Check required fields
  if (typeof backup.version !== "number") return false;
  if (typeof backup.exportedAt !== "string") return false;

  // Arrays can be missing (for older versions) but if present must be arrays
  if (backup.intakeRecords !== undefined && !Array.isArray(backup.intakeRecords)) return false;
  if (backup.weightRecords !== undefined && !Array.isArray(backup.weightRecords)) return false;
  if (backup.bloodPressureRecords !== undefined && !Array.isArray(backup.bloodPressureRecords)) return false;
  if (backup.eatingRecords !== undefined && !Array.isArray(backup.eatingRecords)) return false;
  if (backup.urinationRecords !== undefined && !Array.isArray(backup.urinationRecords)) return false;
  if (backup.defecationRecords !== undefined && !Array.isArray(backup.defecationRecords)) return false;
  if (backup.substanceRecords !== undefined && !Array.isArray(backup.substanceRecords)) return false;
  if (backup.prescriptions !== undefined && !Array.isArray(backup.prescriptions)) return false;
  if (backup.medicationPhases !== undefined && !Array.isArray(backup.medicationPhases)) return false;
  if (backup.phaseSchedules !== undefined && !Array.isArray(backup.phaseSchedules)) return false;
  if (backup.inventoryItems !== undefined && !Array.isArray(backup.inventoryItems)) return false;
  if (backup.inventoryTransactions !== undefined && !Array.isArray(backup.inventoryTransactions)) return false;
  if (backup.doseLogs !== undefined && !Array.isArray(backup.doseLogs)) return false;
  if (backup.titrationPlans !== undefined && !Array.isArray(backup.titrationPlans)) return false;
  if (backup.dailyNotes !== undefined && !Array.isArray(backup.dailyNotes)) return false;
  if (backup.auditLogs !== undefined && !Array.isArray(backup.auditLogs)) return false;

  return true;
}

// --- Record validators ---

function isValidIntakeRecord(record: unknown): record is IntakeRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    (r.type === "water" || r.type === "salt") &&
    typeof r.amount === "number" &&
    typeof r.timestamp === "number"
  );
}

function isValidWeightRecord(record: unknown): record is WeightRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.weight === "number" &&
    typeof r.timestamp === "number"
  );
}

function isValidBPRecord(record: unknown): record is BloodPressureRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.systolic === "number" &&
    typeof r.diastolic === "number" &&
    typeof r.timestamp === "number" &&
    (r.position === "sitting" || r.position === "standing") &&
    (r.arm === "left" || r.arm === "right")
  );
}

function isValidEatingRecord(record: unknown): record is EatingRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.timestamp === "number";
}

function isValidUrinationRecord(record: unknown): record is UrinationRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.timestamp === "number";
}

function isValidDefecationRecord(record: unknown): record is DefecationRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.timestamp === "number";
}

function isValidSubstanceRecord(record: unknown): record is SubstanceRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    (r.type === "caffeine" || r.type === "alcohol") &&
    typeof r.timestamp === "number"
  );
}

function isValidPrescription(record: unknown): record is Prescription {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.genericName === "string" &&
    typeof r.indication === "string" &&
    typeof r.isActive === "boolean"
  );
}

function isValidMedicationPhase(record: unknown): record is MedicationPhase {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.prescriptionId === "string" &&
    typeof r.type === "string" &&
    typeof r.unit === "string"
  );
}

function isValidPhaseSchedule(record: unknown): record is PhaseSchedule {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.phaseId === "string" &&
    typeof r.dosage === "number"
  );
}

function isValidInventoryItem(record: unknown): record is InventoryItem {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.prescriptionId === "string" &&
    typeof r.brandName === "string"
  );
}

function isValidInventoryTransaction(record: unknown): record is InventoryTransaction {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.inventoryItemId === "string" &&
    typeof r.amount === "number"
  );
}

function isValidDoseLog(record: unknown): record is DoseLog {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.prescriptionId === "string" &&
    typeof r.phaseId === "string" &&
    typeof r.scheduledDate === "string"
  );
}

function isValidTitrationPlan(record: unknown): record is TitrationPlan {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    typeof r.status === "string"
  );
}

function isValidDailyNote(record: unknown): record is DailyNote {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.date === "string" &&
    typeof r.note === "string"
  );
}

function isValidAuditLog(record: unknown): record is AuditLog {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.timestamp === "number" &&
    typeof r.action === "string"
  );
}

/**
 * Conflict-aware merge for a single medication/system table.
 * Returns the number of new records imported.
 */
async function mergeTableWithConflicts<T extends { id: string }>(
  tableName: string,
  records: T[],
  validator: (r: unknown) => boolean,
  result: ImportResult,
): Promise<number> {
  const table = db.table(tableName);
  const existingIds = new Set(await table.toCollection().primaryKeys());
  const toImport: T[] = [];

  for (const record of records) {
    if (!validator(record)) {
      result.skipped++;
      continue;
    }
    if (!existingIds.has(record.id)) {
      toImport.push(record);
    } else {
      // Fetch full record and compare content
      const existing = await table.get(record.id) as Record<string, unknown> | undefined;
      if (existing && isContentEqual(existing, record as unknown as Record<string, unknown>)) {
        result.skipped++;
      } else {
        result.conflicts.push({
          table: tableName,
          id: record.id,
          current: existing as Record<string, unknown>,
          backup: record as unknown as Record<string, unknown>,
        });
      }
    }
  }

  if (toImport.length > 0) {
    await table.bulkPut(toImport);
  }
  return toImport.length;
}

/**
 * Import backup data from a file (mutation -- keeps ServiceResult)
 */
export async function importBackup(
  file: File,
  mode: "merge" | "replace" = "merge"
): Promise<ServiceResult<ImportResult>> {
  const result = emptyImportResult();

  try {
    const text = await file.text();
    let data: unknown;

    try {
      data = JSON.parse(text);
    } catch {
      result.errors.push("Invalid JSON format");
      return ok(result);
    }

    // Detect encrypted backup and return informative error
    if (
      data &&
      typeof data === "object" &&
      (data as Record<string, unknown>).encrypted === true
    ) {
      result.errors.push(
        "This backup is encrypted. Please use importEncryptedBackup() with your PIN."
      );
      return ok(result);
    }

    // Handle legacy format (version 1 with just "records")
    if (data && typeof data === "object" && "records" in data && !("intakeRecords" in data)) {
      const legacyData = data as { version?: number; records?: unknown[] };
      data = {
        version: legacyData.version || 1,
        exportedAt: new Date().toISOString(),
        intakeRecords: legacyData.records || [],
        weightRecords: [],
        bloodPressureRecords: [],
      };
    }

    if (!validateBackupData(data)) {
      result.errors.push("Invalid backup file format");
      return ok(result);
    }

    // Clear existing data if replacing (merge never clears; we only add/update)
    if (mode === "replace") {
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
    }

    // --- Health tables: simple skip-based merge (backward-compatible) ---

    if (mode === "merge") {
      // Get existing IDs for health tables
      const [intakeIds, weightIds, bpIds, eatingIds, urinationIds, defecationIds, substanceIds] = await Promise.all([
        db.intakeRecords.toCollection().primaryKeys(),
        db.weightRecords.toCollection().primaryKeys(),
        db.bloodPressureRecords.toCollection().primaryKeys(),
        db.eatingRecords.toCollection().primaryKeys(),
        db.urinationRecords.toCollection().primaryKeys(),
        db.defecationRecords.toCollection().primaryKeys(),
        db.substanceRecords.toCollection().primaryKeys(),
      ]);

      const healthIdSets = {
        intake: new Set(intakeIds),
        weight: new Set(weightIds),
        bp: new Set(bpIds),
        eating: new Set(eatingIds),
        urination: new Set(urinationIds),
        defecation: new Set(defecationIds),
        substance: new Set(substanceIds),
      };

      result.intakeImported = await importHealthTable(data.intakeRecords || [], isValidIntakeRecord, healthIdSets.intake, db.intakeRecords, result);
      result.weightImported = await importHealthTable(data.weightRecords || [], isValidWeightRecord, healthIdSets.weight, db.weightRecords, result);
      result.bpImported = await importHealthTable(data.bloodPressureRecords || [], isValidBPRecord, healthIdSets.bp, db.bloodPressureRecords, result);
      result.eatingImported = await importHealthTable(data.eatingRecords || [], isValidEatingRecord, healthIdSets.eating, db.eatingRecords, result);
      result.urinationImported = await importHealthTable(data.urinationRecords || [], isValidUrinationRecord, healthIdSets.urination, db.urinationRecords, result);
      result.defecationImported = await importHealthTable(data.defecationRecords || [], isValidDefecationRecord, healthIdSets.defecation, db.defecationRecords, result);
      result.substanceImported = await importHealthTable(data.substanceRecords || [], isValidSubstanceRecord, healthIdSets.substance, db.substanceRecords, result);

      // --- Medication/system tables: conflict-aware merge ---
      result.prescriptionsImported = await mergeTableWithConflicts("prescriptions", data.prescriptions || [], isValidPrescription, result);
      result.phasesImported = await mergeTableWithConflicts("medicationPhases", data.medicationPhases || [], isValidMedicationPhase, result);
      result.schedulesImported = await mergeTableWithConflicts("phaseSchedules", data.phaseSchedules || [], isValidPhaseSchedule, result);
      result.inventoryItemsImported = await mergeTableWithConflicts("inventoryItems", data.inventoryItems || [], isValidInventoryItem, result);
      result.inventoryTransactionsImported = await mergeTableWithConflicts("inventoryTransactions", data.inventoryTransactions || [], isValidInventoryTransaction, result);
      result.doseLogsImported = await mergeTableWithConflicts("doseLogs", data.doseLogs || [], isValidDoseLog, result);
      result.titrationPlansImported = await mergeTableWithConflicts("titrationPlans", data.titrationPlans || [], isValidTitrationPlan, result);
      result.dailyNotesImported = await mergeTableWithConflicts("dailyNotes", data.dailyNotes || [], isValidDailyNote, result);
      result.auditLogsImported = await mergeTableWithConflicts("auditLogs", data.auditLogs || [], isValidAuditLog, result);
    } else {
      // Replace mode: import everything without ID checks
      result.intakeImported = await importHealthTable(data.intakeRecords || [], isValidIntakeRecord, new Set(), db.intakeRecords, result);
      result.weightImported = await importHealthTable(data.weightRecords || [], isValidWeightRecord, new Set(), db.weightRecords, result);
      result.bpImported = await importHealthTable(data.bloodPressureRecords || [], isValidBPRecord, new Set(), db.bloodPressureRecords, result);
      result.eatingImported = await importHealthTable(data.eatingRecords || [], isValidEatingRecord, new Set(), db.eatingRecords, result);
      result.urinationImported = await importHealthTable(data.urinationRecords || [], isValidUrinationRecord, new Set(), db.urinationRecords, result);
      result.defecationImported = await importHealthTable(data.defecationRecords || [], isValidDefecationRecord, new Set(), db.defecationRecords, result);
      result.substanceImported = await importHealthTable(data.substanceRecords || [], isValidSubstanceRecord, new Set(), db.substanceRecords, result);

      // Medication tables in replace mode: no conflict detection, just import
      result.prescriptionsImported = await importHealthTable(data.prescriptions || [], isValidPrescription, new Set(), db.prescriptions, result);
      result.phasesImported = await importHealthTable(data.medicationPhases || [], isValidMedicationPhase, new Set(), db.medicationPhases, result);
      result.schedulesImported = await importHealthTable(data.phaseSchedules || [], isValidPhaseSchedule, new Set(), db.phaseSchedules, result);
      result.inventoryItemsImported = await importHealthTable(data.inventoryItems || [], isValidInventoryItem, new Set(), db.inventoryItems, result);
      result.inventoryTransactionsImported = await importHealthTable(data.inventoryTransactions || [], isValidInventoryTransaction, new Set(), db.inventoryTransactions, result);
      result.doseLogsImported = await importHealthTable(data.doseLogs || [], isValidDoseLog, new Set(), db.doseLogs, result);
      result.titrationPlansImported = await importHealthTable(data.titrationPlans || [], isValidTitrationPlan, new Set(), db.titrationPlans, result);
      result.dailyNotesImported = await importHealthTable(data.dailyNotes || [], isValidDailyNote, new Set(), db.dailyNotes, result);
      result.auditLogsImported = await importHealthTable(data.auditLogs || [], isValidAuditLog, new Set(), db.auditLogs, result);
    }

    result.success = true;

    const totalImported =
      result.intakeImported + result.weightImported + result.bpImported +
      result.eatingImported + result.urinationImported + result.defecationImported +
      result.substanceImported + result.prescriptionsImported + result.phasesImported +
      result.schedulesImported + result.inventoryItemsImported + result.inventoryTransactionsImported +
      result.doseLogsImported + result.titrationPlansImported + result.dailyNotesImported +
      result.auditLogsImported;
    logAudit("data_import", `Imported ${totalImported} records (${result.skipped} skipped, ${result.conflicts.length} conflicts)`);

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Unknown error during import");
  }

  return ok(result);
}

/**
 * Simple health table import: validate, skip existing IDs, bulkPut new records.
 */
async function importHealthTable<T extends { id: string }>(
  records: T[],
  validator: (r: unknown) => boolean,
  existingIds: Set<string>,
  table: { bulkPut: (items: T[]) => Promise<unknown> },
  result: ImportResult,
): Promise<number> {
  const toImport: T[] = [];
  for (const record of records) {
    if (!validator(record)) {
      result.skipped++;
      continue;
    }
    if (existingIds.has(record.id)) {
      result.skipped++;
      continue;
    }
    toImport.push(record);
  }
  if (toImport.length > 0) {
    await table.bulkPut(toImport);
  }
  return toImport.length;
}

/**
 * Resolve conflicts after a merge import.
 * For each resolution, if useBackup is true, overwrite the local record with the backup version.
 */
export async function resolveConflicts(
  resolutions: Array<{ table: string; id: string; useBackup: boolean; backupRecord: Record<string, unknown> }>
): Promise<ServiceResult<{ resolved: number }>> {
  try {
    let resolved = 0;
    for (const res of resolutions) {
      if (res.useBackup) {
        const table = db.table(res.table);
        await table.put(res.backupRecord);
        resolved++;
      }
    }
    logAudit("data_import", `Resolved ${resolved} conflicts (${resolutions.length - resolved} kept current)`);
    return ok({ resolved });
  } catch (e) {
    return err("Failed to resolve conflicts", e);
  }
}

/**
 * Get backup statistics.
 * Read function -- returns T directly, lets errors propagate.
 */
export async function getBackupStats(): Promise<{
  intakeCount: number;
  weightCount: number;
  bpCount: number;
  eatingCount: number;
  urinationCount: number;
  defecationCount: number;
  substanceCount: number;
  prescriptionCount: number;
  phaseCount: number;
  scheduleCount: number;
  inventoryItemCount: number;
  inventoryTransactionCount: number;
  doseLogCount: number;
  titrationPlanCount: number;
  dailyNoteCount: number;
  auditLogCount: number;
  totalCount: number;
  oldestRecord: Date | null;
  newestRecord: Date | null;
}> {
  const [
    intakeRecords, weightRecords, bpRecords, eatingRecords, urinationRecords, defecationRecords, substanceRecords,
    prescriptions, phases, schedules, inventoryItems, inventoryTransactions, doseLogs,
    titrationPlans, dailyNotes, auditLogs,
  ] = await Promise.all([
    db.intakeRecords.toArray(),
    db.weightRecords.toArray(),
    db.bloodPressureRecords.toArray(),
    db.eatingRecords.toArray(),
    db.urinationRecords.toArray(),
    db.defecationRecords.toArray(),
    db.substanceRecords.toArray(),
    db.prescriptions.toArray(),
    db.medicationPhases.toArray(),
    db.phaseSchedules.toArray(),
    db.inventoryItems.toArray(),
    db.inventoryTransactions.toArray(),
    db.doseLogs.toArray(),
    db.titrationPlans.toArray(),
    db.dailyNotes.toArray(),
    db.auditLogs.toArray(),
  ]);

  const allTimestamps = [
    ...intakeRecords.map((r) => r.timestamp),
    ...weightRecords.map((r) => r.timestamp),
    ...bpRecords.map((r) => r.timestamp),
    ...eatingRecords.map((r) => r.timestamp),
    ...urinationRecords.map((r) => r.timestamp),
    ...defecationRecords.map((r) => r.timestamp),
    ...substanceRecords.map((r) => r.timestamp),
    ...inventoryTransactions.map((r) => r.timestamp),
    ...auditLogs.map((r) => r.timestamp),
  ];

  return {
    intakeCount: intakeRecords.length,
    weightCount: weightRecords.length,
    bpCount: bpRecords.length,
    eatingCount: eatingRecords.length,
    urinationCount: urinationRecords.length,
    defecationCount: defecationRecords.length,
    substanceCount: substanceRecords.length,
    prescriptionCount: prescriptions.length,
    phaseCount: phases.length,
    scheduleCount: schedules.length,
    inventoryItemCount: inventoryItems.length,
    inventoryTransactionCount: inventoryTransactions.length,
    doseLogCount: doseLogs.length,
    titrationPlanCount: titrationPlans.length,
    dailyNoteCount: dailyNotes.length,
    auditLogCount: auditLogs.length,
    totalCount:
      intakeRecords.length + weightRecords.length + bpRecords.length +
      eatingRecords.length + urinationRecords.length + defecationRecords.length +
      substanceRecords.length + prescriptions.length + phases.length +
      schedules.length + inventoryItems.length + inventoryTransactions.length +
      doseLogs.length + titrationPlans.length + dailyNotes.length + auditLogs.length,
    oldestRecord: allTimestamps.length > 0 ? new Date(Math.min(...allTimestamps)) : null,
    newestRecord: allTimestamps.length > 0 ? new Date(Math.max(...allTimestamps)) : null,
  };
}
