/**
 * Comprehensive backup service for all health data.
 * Supports export/import of intake records, weight records, and blood pressure records.
 */

import { db, type IntakeRecord, type WeightRecord, type BloodPressureRecord, type EatingRecord, type UrinationRecord, type DefecationRecord, type SubstanceRecord } from "./db";
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
  settings?: Record<string, unknown>;
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
  skipped: number;
  errors: string[];
}

const CURRENT_BACKUP_VERSION = 4;

export interface EncryptedBackup {
  encrypted: true;
  payload: EncryptedData;
  version: number;
}

/**
 * Export all health data to a JSON blob.
 * Read function — returns Blob directly, lets errors propagate.
 */
export async function exportBackup(): Promise<Blob> {
  const [intakeRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords, defecationRecords, substanceRecords] = await Promise.all([
    db.intakeRecords.toArray(),
    db.weightRecords.toArray(),
    db.bloodPressureRecords.toArray(),
    db.eatingRecords.toArray(),
    db.urinationRecords.toArray(),
    db.defecationRecords.toArray(),
    db.substanceRecords.toArray(),
  ]);

  // Get settings from localStorage (excluding sensitive data)
  let settings: Record<string, unknown> = {};
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("intake-tracker-settings");
      if (stored) {
        const parsed = JSON.parse(stored);
        // Remove sensitive data from backup
        if (parsed?.state) {
          const { perplexityApiKey, ...safeState } = parsed.state;
          settings = { state: safeState };
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
    settings,
  };

  logAudit("data_export", `Exported ${intakeRecords.length} intake, ${weightRecords.length} weight, ${bloodPressureRecords.length} BP, ${eatingRecords.length} eating, ${urinationRecords.length} urination, ${defecationRecords.length} defecation, ${substanceRecords.length} substance records`);

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
 * Download a backup file (mutation — keeps ServiceResult)
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
      return ok({
        success: false,
        intakeImported: 0,
        weightImported: 0,
        bpImported: 0,
        eatingImported: 0,
        urinationImported: 0,
        defecationImported: 0,
        substanceImported: 0,
        skipped: 0,
        errors: ["Invalid JSON format"],
      });
    }

    if (
      !outer ||
      typeof outer !== "object" ||
      !(outer as Record<string, unknown>).encrypted
    ) {
      return ok({
        success: false,
        intakeImported: 0,
        weightImported: 0,
        bpImported: 0,
        eatingImported: 0,
        urinationImported: 0,
        defecationImported: 0,
        substanceImported: 0,
        skipped: 0,
        errors: [
          "File is not an encrypted backup. Use importBackup() for unencrypted files.",
        ],
      });
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
    return ok({
      success: false,
      intakeImported: 0,
      weightImported: 0,
      bpImported: 0,
      eatingImported: 0,
      urinationImported: 0,
      defecationImported: 0,
      substanceImported: 0,
      skipped: 0,
      errors: [message],
    });
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

  return true;
}

/**
 * Validate an intake record
 */
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

/**
 * Validate a weight record
 */
function isValidWeightRecord(record: unknown): record is WeightRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.weight === "number" &&
    typeof r.timestamp === "number"
  );
}

/**
 * Validate a blood pressure record
 */
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

/**
 * Validate an eating record
 */
function isValidEatingRecord(record: unknown): record is EatingRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.timestamp === "number";
}

/**
 * Validate a urination record
 */
function isValidUrinationRecord(record: unknown): record is UrinationRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.timestamp === "number";
}

/**
 * Validate a defecation record
 */
function isValidDefecationRecord(record: unknown): record is DefecationRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.timestamp === "number";
}

/**
 * Validate a substance record
 */
function isValidSubstanceRecord(record: unknown): record is SubstanceRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    (r.type === "caffeine" || r.type === "alcohol") &&
    typeof r.timestamp === "number"
  );
}

/**
 * Import backup data from a file (mutation — keeps ServiceResult)
 */
export async function importBackup(
  file: File,
  mode: "merge" | "replace" = "merge"
): Promise<ServiceResult<ImportResult>> {
  const result: ImportResult = {
    success: false,
    intakeImported: 0,
    weightImported: 0,
    bpImported: 0,
    eatingImported: 0,
    urinationImported: 0,
    defecationImported: 0,
    substanceImported: 0,
    skipped: 0,
    errors: [],
  };

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
      ]);
    }

    // Get existing IDs if merging (so we don't overwrite; merge = add new only by id)
    let existingIntakeIds = new Set<string>();
    let existingWeightIds = new Set<string>();
    let existingBPIds = new Set<string>();
    let existingEatingIds = new Set<string>();
    let existingUrinationIds = new Set<string>();
    let existingDefecationIds = new Set<string>();
    let existingSubstanceIds = new Set<string>();

    if (mode === "merge") {
      const [intakeIds, weightIds, bpIds, eatingIds, urinationIds, defecationIds, substanceIds] = await Promise.all([
        db.intakeRecords.toCollection().primaryKeys(),
        db.weightRecords.toCollection().primaryKeys(),
        db.bloodPressureRecords.toCollection().primaryKeys(),
        db.eatingRecords.toCollection().primaryKeys(),
        db.urinationRecords.toCollection().primaryKeys(),
        db.defecationRecords.toCollection().primaryKeys(),
        db.substanceRecords.toCollection().primaryKeys(),
      ]);
      existingIntakeIds = new Set(intakeIds);
      existingWeightIds = new Set(weightIds);
      existingBPIds = new Set(bpIds);
      existingEatingIds = new Set(eatingIds);
      existingUrinationIds = new Set(urinationIds);
      existingDefecationIds = new Set(defecationIds);
      existingSubstanceIds = new Set(substanceIds);
    }

    // Import intake records
    const intakeToImport: IntakeRecord[] = [];
    for (const record of data.intakeRecords || []) {
      if (!isValidIntakeRecord(record)) {
        result.skipped++;
        continue;
      }
      if (mode === "merge" && existingIntakeIds.has(record.id)) {
        result.skipped++;
        continue;
      }
      intakeToImport.push(record);
    }
    if (intakeToImport.length > 0) {
      await db.intakeRecords.bulkPut(intakeToImport);
      result.intakeImported = intakeToImport.length;
    }

    // Import weight records
    const weightToImport: WeightRecord[] = [];
    for (const record of data.weightRecords || []) {
      if (!isValidWeightRecord(record)) {
        result.skipped++;
        continue;
      }
      if (mode === "merge" && existingWeightIds.has(record.id)) {
        result.skipped++;
        continue;
      }
      weightToImport.push(record);
    }
    if (weightToImport.length > 0) {
      await db.weightRecords.bulkPut(weightToImport);
      result.weightImported = weightToImport.length;
    }

    // Import blood pressure records
    const bpToImport: BloodPressureRecord[] = [];
    for (const record of data.bloodPressureRecords || []) {
      if (!isValidBPRecord(record)) {
        result.skipped++;
        continue;
      }
      if (mode === "merge" && existingBPIds.has(record.id)) {
        result.skipped++;
        continue;
      }
      bpToImport.push(record);
    }
    if (bpToImport.length > 0) {
      await db.bloodPressureRecords.bulkPut(bpToImport);
      result.bpImported = bpToImport.length;
    }

    // Import eating records (optional in backup file)
    const eatingToImport: EatingRecord[] = [];
    for (const record of data.eatingRecords || []) {
      if (!isValidEatingRecord(record)) {
        result.skipped++;
        continue;
      }
      if (mode === "merge" && existingEatingIds.has(record.id)) {
        result.skipped++;
        continue;
      }
      eatingToImport.push(record);
    }
    if (eatingToImport.length > 0) {
      await db.eatingRecords.bulkPut(eatingToImport);
      result.eatingImported = eatingToImport.length;
    }

    // Import urination records (optional in backup file)
    const urinationToImport: UrinationRecord[] = [];
    for (const record of data.urinationRecords || []) {
      if (!isValidUrinationRecord(record)) {
        result.skipped++;
        continue;
      }
      if (mode === "merge" && existingUrinationIds.has(record.id)) {
        result.skipped++;
        continue;
      }
      urinationToImport.push(record);
    }
    if (urinationToImport.length > 0) {
      await db.urinationRecords.bulkPut(urinationToImport);
      result.urinationImported = urinationToImport.length;
    }

    // Import defecation records (optional in backup file)
    const defecationToImport: DefecationRecord[] = [];
    for (const record of data.defecationRecords || []) {
      if (!isValidDefecationRecord(record)) {
        result.skipped++;
        continue;
      }
      if (mode === "merge" && existingDefecationIds.has(record.id)) {
        result.skipped++;
        continue;
      }
      defecationToImport.push(record);
    }
    if (defecationToImport.length > 0) {
      await db.defecationRecords.bulkPut(defecationToImport);
      result.defecationImported = defecationToImport.length;
    }

    // Import substance records (optional in backup file)
    const substanceToImport: SubstanceRecord[] = [];
    for (const record of data.substanceRecords || []) {
      if (!isValidSubstanceRecord(record)) {
        result.skipped++;
        continue;
      }
      if (mode === "merge" && existingSubstanceIds.has(record.id)) {
        result.skipped++;
        continue;
      }
      substanceToImport.push(record);
    }
    if (substanceToImport.length > 0) {
      await db.substanceRecords.bulkPut(substanceToImport);
      result.substanceImported = substanceToImport.length;
    }

    result.success = true;

    const totalImported =
      result.intakeImported +
      result.weightImported +
      result.bpImported +
      result.eatingImported +
      result.urinationImported +
      result.defecationImported +
      result.substanceImported;
    logAudit("data_import", `Imported ${totalImported} records (${result.skipped} skipped)`);

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Unknown error during import");
  }

  return ok(result);
}

/**
 * Get backup statistics.
 * Read function — returns T directly, lets errors propagate.
 */
export async function getBackupStats(): Promise<{
  intakeCount: number;
  weightCount: number;
  bpCount: number;
  eatingCount: number;
  urinationCount: number;
  defecationCount: number;
  substanceCount: number;
  totalCount: number;
  oldestRecord: Date | null;
  newestRecord: Date | null;
}> {
  const [intakeRecords, weightRecords, bpRecords, eatingRecords, urinationRecords, defecationRecords, substanceRecords] = await Promise.all([
    db.intakeRecords.toArray(),
    db.weightRecords.toArray(),
    db.bloodPressureRecords.toArray(),
    db.eatingRecords.toArray(),
    db.urinationRecords.toArray(),
    db.defecationRecords.toArray(),
    db.substanceRecords.toArray(),
  ]);

  const allTimestamps = [
    ...intakeRecords.map((r) => r.timestamp),
    ...weightRecords.map((r) => r.timestamp),
    ...bpRecords.map((r) => r.timestamp),
    ...eatingRecords.map((r) => r.timestamp),
    ...urinationRecords.map((r) => r.timestamp),
    ...defecationRecords.map((r) => r.timestamp),
    ...substanceRecords.map((r) => r.timestamp),
  ];

  return {
    intakeCount: intakeRecords.length,
    weightCount: weightRecords.length,
    bpCount: bpRecords.length,
    eatingCount: eatingRecords.length,
    urinationCount: urinationRecords.length,
    defecationCount: defecationRecords.length,
    substanceCount: substanceRecords.length,
    totalCount: allTimestamps.length,
    oldestRecord: allTimestamps.length > 0 ? new Date(Math.min(...allTimestamps)) : null,
    newestRecord: allTimestamps.length > 0 ? new Date(Math.max(...allTimestamps)) : null,
  };
}
