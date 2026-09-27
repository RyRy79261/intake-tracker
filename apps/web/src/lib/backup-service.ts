/**
 * Comprehensive backup service for all health data — export/import of every
 * synced data table (including userProfile and userSettings).
 *
 * Conflict detection is scoped: in merge mode the medication/system tables and
 * userProfile/userSettings record conflicts, while health tables skip rows whose id is
 * already live locally. A backup row whose local copy is tombstoned restores
 * it in every table. Replace mode bypasses conflict detection, overwrites
 * every table and tombstones local rows the backup lacks (only in tables the
 * file includes).
 *
 * Every import runs in one Dexie transaction and goes through the sync queue
 * like any other write (audit analytics-history-export#4):
 * - a new live row is enqueued as-is, keeping its own `updatedAt`, so a newer
 *   copy already on the server still wins last-write-wins;
 * - a row that replaces a local one (restore over a tombstone, a resolved
 *   conflict, replace mode) gets a fresh `updatedAt` so it wins;
 * - a backup tombstone for an unknown id is kept locally but never pushed, so
 *   an old backup can't delete a record that lives on the server.
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
  type UserProfile,
  type InsightReport,
  type UserSettings,
} from "@/lib/db";
import { ok, err } from "@intake/core/service";
import { isLive } from "@intake/core/lifecycle";
import type { ServiceResult } from "@intake/types/service";
import { logAudit } from "@/lib/audit";
import { BACKUP_VALIDATORS } from "@/lib/backup-schemas";
import { TABLE_PUSH_ORDER, type TableName } from "@/lib/sync-topology";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/utils";
import { getDeviceTimezone } from "@/lib/timezone";
import {
  getActiveUserSettings,
  pickSyncedSettings,
  settingsFromRow,
  userSettingsFromLegacyBlob,
  SEED_UPDATED_AT,
} from "@/lib/settings-sync";
import { useSettingsStore } from "@/stores/settings-store";

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
  userProfile?: UserProfile[];
  insightReports?: InsightReport[];
  userSettings?: UserSettings[];
  // The raw settings-store blob (`{ state }`), device preferences included.
  // Backups older than the userSettings table carry the synced settings only
  // here; import turns them into a userSettings row.
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
  userProfileImported: number;
  insightReportsImported: number;
  userSettingsImported: number;
  /** Sum of every `*Imported` count above. */
  totalImported: number;
  skipped: number;
  conflicts: ConflictRecord[];
  errors: string[];
}

type ImportCountKey = Exclude<
  { [K in keyof ImportResult]: ImportResult[K] extends number ? K : never }[keyof ImportResult],
  "skipped" | "totalImported"
>;

/** ImportResult counter for each backed-up table. */
const IMPORT_COUNT_KEY: Record<TableName, ImportCountKey> = {
  intakeRecords: "intakeImported",
  weightRecords: "weightImported",
  bloodPressureRecords: "bpImported",
  eatingRecords: "eatingImported",
  urinationRecords: "urinationImported",
  defecationRecords: "defecationImported",
  substanceRecords: "substanceImported",
  prescriptions: "prescriptionsImported",
  medicationPhases: "phasesImported",
  phaseSchedules: "schedulesImported",
  inventoryItems: "inventoryItemsImported",
  inventoryTransactions: "inventoryTransactionsImported",
  doseLogs: "doseLogsImported",
  titrationPlans: "titrationPlansImported",
  dailyNotes: "dailyNotesImported",
  auditLogs: "auditLogsImported",
  userProfile: "userProfileImported",
  insightReports: "insightReportsImported",
  userSettings: "userSettingsImported",
};

/** Health tables: a live local row always wins, no conflict is raised. */
const SKIP_EXISTING_TABLES: ReadonlySet<TableName> = new Set<TableName>([
  "intakeRecords",
  "weightRecords",
  "bloodPressureRecords",
  "eatingRecords",
  "urinationRecords",
  "defecationRecords",
  "substanceRecords",
]);

/** Tables whose record type has no `timezone` column (see baseSyncFields). */
const NO_TIMEZONE_TABLES: ReadonlySet<TableName> = new Set<TableName>([
  "prescriptions",
  "medicationPhases",
  "phaseSchedules",
  "titrationPlans",
  "userProfile",
  "insightReports",
  "userSettings",
]);

type Row = Record<string, unknown> & { id: string; deletedAt?: number | null; updatedAt?: number };

const CURRENT_BACKUP_VERSION = 5;

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
    userProfileImported: 0,
    insightReportsImported: 0,
    userSettingsImported: 0,
    totalImported: 0,
    skipped: 0,
    conflicts: [],
    errors: [],
  };
}

/**
 * Compare two records ignoring sync metadata fields (but not whether each is
 * live or deleted).
 */
const IGNORE_FIELDS = new Set(["createdAt", "updatedAt", "deletedAt", "deviceId", "timezone"]);

function isContentEqual(a: Row, b: Row): boolean {
  // Collect all keys from both objects, excluding sync metadata
  const allKeys: string[] = [];
  const seen = new Set<string>();
  const addKeys = (keys: string[]) => {
    keys.forEach(k => {
      if (!IGNORE_FIELDS.has(k) && !seen.has(k)) {
        seen.add(k);
        allKeys.push(k);
      }
    });
  };
  addKeys(Object.keys(a));
  addKeys(Object.keys(b));
  // A live row and a tombstone of it are never "the same" -- restoring a
  // backup is how a deletion gets undone (audit analytics-history-export#3).
  if (isLive(a) !== isLive(b)) return false;
  // Compare values -- treat missing keys and undefined as equivalent
  for (let i = 0; i < allKeys.length; i++) {
    const k = allKeys[i]!;
    const aVal = a[k];
    const bVal = b[k];
    if (aVal === undefined && bVal === undefined) continue;
    if (JSON.stringify(aVal) !== JSON.stringify(bVal)) return false;
  }
  return true;
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
    titrationPlans, dailyNotes, auditLogs, userProfile, insightReports,
    userSettings,
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
    db.userProfile.toArray(),
    db.insightReports.toArray(),
    db.userSettings.toArray(),
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
    userProfile,
    insightReports,
    userSettings,
    settings,
  };

  logAudit(
    "data_export",
    `Exported ${intakeRecords.length} intake, ${weightRecords.length} weight, ${bloodPressureRecords.length} BP, ` +
    `${eatingRecords.length} eating, ${urinationRecords.length} urination, ${defecationRecords.length} defecation, ` +
    `${substanceRecords.length} substance, ${prescriptions.length} prescriptions, ${medicationPhases.length} phases, ` +
    `${phaseSchedules.length} schedules, ${inventoryItems.length} inventory items, ${inventoryTransactions.length} inv txns, ` +
    `${doseLogs.length} dose logs, ${titrationPlans.length} titration plans, ${dailyNotes.length} daily notes, ` +
    `${auditLogs.length} audit logs, ${userProfile.length} profile, ` +
    `${insightReports.length} insight reports, ${userSettings.length} settings`
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
  if (backup.userProfile !== undefined && !Array.isArray(backup.userProfile)) return false;
  if (backup.insightReports !== undefined && !Array.isArray(backup.insightReports)) return false;
  if (backup.userSettings !== undefined && !Array.isArray(backup.userSettings)) return false;

  return true;
}

/**
 * Fill sync metadata a backup row lacks. Backups exported before the sync
 * fields existed (the v1 `records` format, or any file older than Dexie v10)
 * omit them, and every read path filters on `deletedAt === null`, so an
 * un-normalised row would import but never show up (audit
 * gap-records-history-listing#2).
 */
function normaliseRow(tableName: TableName, record: Row, now: number): Row {
  const row: Row = { ...record };
  row.deletedAt ??= null;
  if (typeof row.createdAt !== "number") {
    row.createdAt = typeof row.timestamp === "number" ? row.timestamp : now;
  }
  row.updatedAt ??= row.createdAt as number;
  row.deviceId ??= getDeviceId();
  if (!NO_TIMEZONE_TABLES.has(tableName)) row.timezone ??= getDeviceTimezone();
  return row;
}

/**
 * Write one backup row and queue it for sync. Must run inside a transaction
 * that covers the table and `_syncQueue`. Returns true if a sync op was queued.
 */
async function writeRow(
  tableName: TableName,
  row: Row,
  existing: Row | undefined,
  now: number,
): Promise<boolean> {
  // A row that replaces a local copy must beat it (and the server's copy of
  // it) under last-write-wins.
  const written: Row = existing
    ? { ...row, updatedAt: Math.max(now, (existing.updatedAt ?? 0) + 1) }
    : row;
  // Settings merge per setting by `fieldUpdatedAt`, not by the row's
  // updatedAt. The backup's old stamps would make every restored setting
  // lose to newer ones (locally on the next pull, and on the server), so a
  // replacing settings row drops them: every setting then counts as changed
  // at the fresh updatedAt, as a whole-row restore should.
  if (existing && tableName === "userSettings") delete written.fieldUpdatedAt;
  await db.table<Row, string>(tableName).put(written);
  if (!existing && !isLive(written)) return false;
  await enqueueInsideTx(tableName, written.id, isLive(written) ? "upsert" : "delete");
  return true;
}

/**
 * A backup older than the userSettings table holds the synced settings only
 * in its `settings` blob. Give it the equivalent userSettings row, so they are
 * restored (or raise a conflict) like any other record.
 */
async function withLegacySettingsRow(data: BackupData): Promise<BackupData> {
  if (data.userSettings !== undefined || !data.settings) return data;
  const current = await getActiveUserSettings();
  const exportedAt = Date.parse(data.exportedAt);
  const row = userSettingsFromLegacyBlob(
    data.settings,
    {
      row: current,
      settings: {
        ...pickSyncedSettings(useSettingsStore.getState()),
        ...(current ? settingsFromRow(current) : {}),
      },
    },
    Number.isFinite(exportedAt) ? exportedAt : SEED_UPDATED_AT,
  );
  return row ? { ...data, userSettings: [row] } : data;
}

function backupRows(data: BackupData, tableName: TableName): Row[] {
  return (data[tableName] ?? []) as unknown as Row[];
}

/**
 * Import every table inside one transaction. Returns the number of sync ops
 * queued. Throws (rolling back the whole import) if any write fails.
 */
async function importTables(
  data: BackupData,
  mode: "merge" | "replace",
  result: ImportResult,
): Promise<number> {
  let queuedOps = 0;
  const tables = TABLE_PUSH_ORDER.map((t) => db.table(t));
  await db.transaction("rw", [...tables, db._syncQueue], async () => {
    const now = Date.now();
    for (const tableName of TABLE_PUSH_ORDER) {
      const table = db.table<Row, string>(tableName);
      const local = new Map((await table.toArray()).map((r) => [r.id, r]));
      const validator = BACKUP_VALIDATORS[tableName];
      const backupIds = new Set<string>();
      let imported = 0;

      for (const record of backupRows(data, tableName)) {
        if (!validator(record)) {
          result.skipped++;
          continue;
        }
        const row = normaliseRow(tableName, record, now);
        backupIds.add(row.id);
        const existing = local.get(row.id);

        if (mode === "merge" && existing) {
          if (!isLive(existing)) {
            // Local copy was deleted: a live backup row restores it.
            if (!isLive(row)) {
              result.skipped++;
              continue;
            }
          } else if (SKIP_EXISTING_TABLES.has(tableName) || isContentEqual(existing, row)) {
            result.skipped++;
            continue;
          } else {
            result.conflicts.push({ table: tableName, id: row.id, current: existing, backup: row });
            continue;
          }
        }

        if (await writeRow(tableName, row, existing, now)) queuedOps++;
        // A repeated id later in the same file is then treated as existing.
        local.set(row.id, row);
        imported++;
      }

      // A file with no key for this table (a backup older than the table)
      // says nothing about it, so replace leaves it alone.
      if (mode === "replace" && data[tableName] !== undefined) {
        // Local rows the backup lacks are tombstoned rather than cleared, so
        // the deletion reaches the server copy too.
        for (const existing of local.values()) {
          if (backupIds.has(existing.id) || !isLive(existing)) continue;
          await table.update(existing.id, { deletedAt: now, updatedAt: now });
          await enqueueInsideTx(tableName, existing.id, "delete");
          queuedOps++;
        }
      }

      result[IMPORT_COUNT_KEY[tableName]] = imported;
    }
  });
  return queuedOps;
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

    // An encrypted backup: the app never offered one in its UI and can no
    // longer read the format, so say so instead of "invalid format".
    if (
      data &&
      typeof data === "object" &&
      (data as Record<string, unknown>).encrypted === true
    ) {
      result.errors.push(
        "This backup is encrypted, and this app cannot read encrypted backups."
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

    const queuedOps = await importTables(await withLegacySettingsRow(data), mode, result);
    if (queuedOps > 0) schedulePush();

    result.totalImported = TABLE_PUSH_ORDER.reduce(
      (sum, t) => sum + result[IMPORT_COUNT_KEY[t]],
      0,
    );
    result.success = true;
    logAudit("data_import", `Imported ${result.totalImported} records (${result.skipped} skipped, ${result.conflicts.length} conflicts)`);

  } catch (error) {
    // The transaction rolled back, so nothing was imported.
    const failed = emptyImportResult();
    failed.errors.push(error instanceof Error ? error.message : "Unknown error during import");
    return ok(failed);
  }

  return ok(result);
}

function isTableName(name: string): name is TableName {
  return (TABLE_PUSH_ORDER as readonly string[]).includes(name);
}

/**
 * Resolve conflicts after a merge import.
 * For each resolution, if useBackup is true, overwrite the local record with
 * the backup version (fresh `updatedAt`, queued for sync).
 */
export async function resolveConflicts(
  resolutions: Array<{ table: string; id: string; useBackup: boolean; backupRecord: Record<string, unknown> }>
): Promise<ServiceResult<{ resolved: number }>> {
  try {
    const chosen = resolutions.filter((r) => r.useBackup);
    for (const res of chosen) {
      if (!isTableName(res.table)) throw new Error(`Unknown table "${res.table}"`);
    }
    const tableNames = [...new Set(chosen.map((r) => r.table as TableName))];
    let queuedOps = 0;
    if (chosen.length > 0) {
      await db.transaction(
        "rw",
        [...tableNames.map((t) => db.table(t)), db._syncQueue],
        async () => {
          const now = Date.now();
          for (const res of chosen) {
            const tableName = res.table as TableName;
            const row = normaliseRow(tableName, { ...res.backupRecord, id: res.id }, now);
            const existing = await db.table<Row, string>(tableName).get(res.id);
            if (await writeRow(tableName, row, existing, now)) queuedOps++;
          }
        },
      );
    }
    if (queuedOps > 0) schedulePush();
    const resolved = chosen.length;
    logAudit("data_import", `Resolved ${resolved} conflicts (${resolutions.length - resolved} kept current)`);
    return ok({ resolved });
  } catch (e) {
    return err("Failed to resolve conflicts", e);
  }
}
