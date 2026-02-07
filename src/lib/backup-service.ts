/**
 * Comprehensive backup service for all health data.
 * Supports export/import of intake records, weight records, and blood pressure records.
 */

import { db, type IntakeRecord, type WeightRecord, type BloodPressureRecord, type EatingRecord, type UrinationRecord } from "./db";
import { logAudit } from "./audit";

export interface BackupData {
  version: number;
  exportedAt: string;
  appVersion?: string;
  intakeRecords: IntakeRecord[];
  weightRecords: WeightRecord[];
  bloodPressureRecords: BloodPressureRecord[];
  eatingRecords?: EatingRecord[];
  urinationRecords?: UrinationRecord[];
  settings?: Record<string, unknown>;
}

export interface ImportResult {
  success: boolean;
  intakeImported: number;
  weightImported: number;
  bpImported: number;
  eatingImported: number;
  urinationImported: number;
  skipped: number;
  errors: string[];
}

const CURRENT_BACKUP_VERSION = 3;

/**
 * Export all health data to a JSON blob
 */
export async function exportBackup(): Promise<Blob> {
  const [intakeRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords] = await Promise.all([
    db.intakeRecords.toArray(),
    db.weightRecords.toArray(),
    db.bloodPressureRecords.toArray(),
    db.eatingRecords.toArray(),
    db.urinationRecords.toArray(),
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
    settings,
  };

  logAudit("data_export", `Exported ${intakeRecords.length} intake, ${weightRecords.length} weight, ${bloodPressureRecords.length} BP, ${eatingRecords.length} eating, ${urinationRecords.length} urination records`);

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
 * Download a backup file
 */
export async function downloadBackup(): Promise<void> {
  const blob = await exportBackup();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = generateBackupFilename();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
 * Import backup data from a file
 */
export async function importBackup(
  file: File,
  mode: "merge" | "replace" = "merge"
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    intakeImported: 0,
    weightImported: 0,
    bpImported: 0,
    eatingImported: 0,
    urinationImported: 0,
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
      return result;
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
      return result;
    }

    // Clear existing data if replacing (merge never clears; we only add/update)
    if (mode === "replace") {
      await Promise.all([
        db.intakeRecords.clear(),
        db.weightRecords.clear(),
        db.bloodPressureRecords.clear(),
        db.eatingRecords.clear(),
        db.urinationRecords.clear(),
      ]);
    }

    // Get existing IDs if merging (so we don't overwrite; merge = add new only by id)
    let existingIntakeIds = new Set<string>();
    let existingWeightIds = new Set<string>();
    let existingBPIds = new Set<string>();
    let existingEatingIds = new Set<string>();
    let existingUrinationIds = new Set<string>();

    if (mode === "merge") {
      const [intakeIds, weightIds, bpIds, eatingIds, urinationIds] = await Promise.all([
        db.intakeRecords.toCollection().primaryKeys(),
        db.weightRecords.toCollection().primaryKeys(),
        db.bloodPressureRecords.toCollection().primaryKeys(),
        db.eatingRecords.toCollection().primaryKeys(),
        db.urinationRecords.toCollection().primaryKeys(),
      ]);
      existingIntakeIds = new Set(intakeIds);
      existingWeightIds = new Set(weightIds);
      existingBPIds = new Set(bpIds);
      existingEatingIds = new Set(eatingIds);
      existingUrinationIds = new Set(urinationIds);
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

    result.success = true;

    const totalImported =
      result.intakeImported +
      result.weightImported +
      result.bpImported +
      result.eatingImported +
      result.urinationImported;
    logAudit("data_import", `Imported ${totalImported} records (${result.skipped} skipped)`);

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Unknown error during import");
  }

  return result;
}

/**
 * Get backup statistics
 */
export async function getBackupStats(): Promise<{
  intakeCount: number;
  weightCount: number;
  bpCount: number;
  eatingCount: number;
  urinationCount: number;
  totalCount: number;
  oldestRecord: Date | null;
  newestRecord: Date | null;
}> {
  const [intakeRecords, weightRecords, bpRecords, eatingRecords, urinationRecords] = await Promise.all([
    db.intakeRecords.toArray(),
    db.weightRecords.toArray(),
    db.bloodPressureRecords.toArray(),
    db.eatingRecords.toArray(),
    db.urinationRecords.toArray(),
  ]);

  const allTimestamps = [
    ...intakeRecords.map((r) => r.timestamp),
    ...weightRecords.map((r) => r.timestamp),
    ...bpRecords.map((r) => r.timestamp),
    ...eatingRecords.map((r) => r.timestamp),
    ...urinationRecords.map((r) => r.timestamp),
  ];

  return {
    intakeCount: intakeRecords.length,
    weightCount: weightRecords.length,
    bpCount: bpRecords.length,
    eatingCount: eatingRecords.length,
    urinationCount: urinationRecords.length,
    totalCount: allTimestamps.length,
    oldestRecord: allTimestamps.length > 0 ? new Date(Math.min(...allTimestamps)) : null,
    newestRecord: allTimestamps.length > 0 ? new Date(Math.max(...allTimestamps)) : null,
  };
}
