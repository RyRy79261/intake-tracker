import "client-only";
import Dexie, { type EntityTable } from "dexie";
import {
  getTimezoneForTimestamp,
  localHHMMStringToUTCMinutes,
} from "@/lib/timezone";
import type {
  AuditLog,
  BloodPressureRecord,
  DailyNote,
  DefecationRecord,
  DoseLog,
  EatingRecord,
  ErrorLogEntry,
  InsightReport,
  IntakeRecord,
  InventoryItem,
  InventoryTransaction,
  MedicationPhase,
  PhaseSchedule,
  Prescription,
  SubstanceRecord,
  SyncMetaRow,
  SyncQueueRow,
  TitrationPlan,
  UrinationRecord,
  UserProfile,
  WeightRecord,
} from "@intake/types/records";

/**
 * The record/data-model types live in `@intake/types/records` (moved there in
 * Phase 3a; the Dexie runtime below stays in the app). Re-export the full
 * surface so existing `@/lib/db` type importers keep resolving unchanged.
 */
export type {
  AuditAction,
  AuditLog,
  BloodPressureRecord,
  CompoundStrength,
  DailyNote,
  DefecationRecord,
  DoseLog,
  DoseStatus,
  EatingRecord,
  ErrorLogEntry,
  ErrorLogSource,
  FoodInstruction,
  InsightReport,
  IntakeRecord,
  InventoryItem,
  InventoryTransaction,
  MedicationPhase,
  PhaseSchedule,
  PhaseType,
  PillShape,
  Prescription,
  SubstanceRecord,
  SyncMetaRow,
  SyncQueueRow,
  TitrationPlan,
  TitrationPlanStatus,
  UrinationRecord,
  UserProfile,
  WeightRecord,
} from "@intake/types/records";

export type AppDatabase = Dexie & {
  intakeRecords: EntityTable<IntakeRecord, "id">;
  auditLogs: EntityTable<AuditLog, "id">;
  weightRecords: EntityTable<WeightRecord, "id">;
  bloodPressureRecords: EntityTable<BloodPressureRecord, "id">;
  eatingRecords: EntityTable<EatingRecord, "id">;
  urinationRecords: EntityTable<UrinationRecord, "id">;
  defecationRecords: EntityTable<DefecationRecord, "id">;
  prescriptions: EntityTable<Prescription, "id">;
  medicationPhases: EntityTable<MedicationPhase, "id">;
  phaseSchedules: EntityTable<PhaseSchedule, "id">;
  inventoryItems: EntityTable<InventoryItem, "id">;
  inventoryTransactions: EntityTable<InventoryTransaction, "id">;
  dailyNotes: EntityTable<DailyNote, "id">;
  doseLogs: EntityTable<DoseLog, "id">;
  substanceRecords: EntityTable<SubstanceRecord, "id">;
  titrationPlans: EntityTable<TitrationPlan, "id">;
  userProfile: EntityTable<UserProfile, "id">;
  insightReports: EntityTable<InsightReport, "id">;
  _syncQueue: EntityTable<SyncQueueRow, "id">;
  _syncMeta: EntityTable<SyncMetaRow, "tableName">;
  _errorLogs: EntityTable<ErrorLogEntry, "id">;
};

const realDb = new Dexie("IntakeTrackerDB") as AppDatabase;

/**
 * The active database. Normally `realDb` (backed by the real IndexedDB), but
 * the in-app component previews swap in a throwaway database via
 * `setActiveDatabase` so a previewed component reads and writes isolated
 * sample data instead of the user's real records. `db` is an ES-module live
 * binding — every `import { db }` consumer follows the swap automatically.
 */
export let db: AppDatabase = realDb;

// Schema is declared cumulatively: each version is the previous version's
// schema with the additions/changes for that version spread in. Dexie still
// needs the full schema per version, but we no longer copy-paste 13 lines
// across 6 versions when only one or two changed.

const V10_STORES = {
  // Health records — compound indexes for date-range correlation queries
  intakeRecords:           "id, [type+timestamp], timestamp, source, updatedAt",
  weightRecords:           "id, timestamp, updatedAt",
  bloodPressureRecords:    "id, timestamp, position, arm, updatedAt",
  eatingRecords:           "id, timestamp, updatedAt",
  urinationRecords:        "id, timestamp, updatedAt",
  defecationRecords:       "id, timestamp, updatedAt",

  // Medication domain — compound indexes for cross-domain queries
  prescriptions:           "id, isActive, updatedAt",
  medicationPhases:        "id, prescriptionId, status, type, updatedAt",
  phaseSchedules:          "id, phaseId, time, enabled, updatedAt",
  inventoryItems:          "id, prescriptionId, isActive, updatedAt",
  inventoryTransactions:   "id, [inventoryItemId+timestamp], inventoryItemId, timestamp, type, updatedAt",
  doseLogs:                "id, [prescriptionId+scheduledDate], prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status, updatedAt",
  dailyNotes:              "id, date, prescriptionId, doseLogId, updatedAt",

  // Audit and system
  auditLogs:               "id, [action+timestamp], timestamp, action",
} as const;

const V11_STORES = V10_STORES;

const V12_STORES = {
  ...V11_STORES,
  substanceRecords:        "id, [type+timestamp], type, timestamp, source, sourceRecordId, updatedAt",
} as const;

const V13_STORES = {
  ...V12_STORES,
  prescriptions:           "id, isActive, updatedAt, createdAt",
} as const;

const V14_STORES = {
  ...V13_STORES,
  medicationPhases:        "id, prescriptionId, status, type, titrationPlanId, updatedAt",
  titrationPlans:          "id, conditionLabel, status, updatedAt",
} as const;

const V15_STORES = {
  ...V14_STORES,
  intakeRecords:           "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  eatingRecords:           "id, timestamp, groupId, updatedAt",
  substanceRecords:        "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",
} as const;

// Version 10: Consolidated schema with sync-readiness fields, compound indexes,
// and event-sourced inventory. Replaces v4-v9 (all prior migrations ran on
// production data and are no longer needed in code). Legacy `medications` and
// `medicationSchedules` tables intentionally omitted — Dexie will delete them.
realDb.version(10).stores(V10_STORES).upgrade(async (trans) => {
  const now = Date.now();
  const deviceId = "migrated-v10";

  // Helper: backfill sync fields on all records in a table
  const backfill = async (tableName: string, timestampField = "timestamp") => {
    await trans.table(tableName).toCollection().modify((record: Record<string, unknown>) => {
      if (record.createdAt == null) {
        record.createdAt = record[timestampField] ?? record.createdAt ?? now;
      }
      if (record.updatedAt == null) {
        record.updatedAt = record.createdAt;
      }
      if (!("deletedAt" in record) || record.deletedAt === undefined) {
        record.deletedAt = null;
      }
      if (record.deviceId == null) {
        record.deviceId = deviceId;
      }
    });
  };

  // Backfill all health record tables
  await backfill("intakeRecords");
  await backfill("weightRecords");
  await backfill("bloodPressureRecords");
  await backfill("eatingRecords");
  await backfill("urinationRecords");
  await backfill("defecationRecords");

  // Backfill medication tables
  await backfill("prescriptions", "createdAt");
  await backfill("medicationPhases", "createdAt");
  await backfill("phaseSchedules", "createdAt");
  await backfill("inventoryItems", "createdAt");
  await backfill("inventoryTransactions");
  await backfill("doseLogs", "actionTimestamp");
  await backfill("dailyNotes", "createdAt");
  await backfill("auditLogs");

  // Event-source inventory: convert legacy currentStock to "initial" transactions
  const items = await trans.table("inventoryItems").toArray();
  for (const item of items) {
    if (item.currentStock != null && item.currentStock > 0) {
      await trans.table("inventoryTransactions").add({
        id: crypto.randomUUID(),
        inventoryItemId: item.id,
        timestamp: item.createdAt ?? now,
        amount: item.currentStock,
        type: "initial",
        note: "Migrated from v9 currentStock field",
        doseLogId: undefined,
        createdAt: item.createdAt ?? now,
        updatedAt: item.createdAt ?? now,
        deletedAt: null,
        deviceId: deviceId,
      });
    }
    // Do not delete currentStock from the record — it stays as a deprecated
    // optional field. Services read it until Phase 3 removes those reads.
    // Setting it to undefined here would cause TypeScript errors in Phase 3
    // to surface correctly (undefined !== absent field in IDB).
  }
});

// Version 11: Add timezone field to all record types. Convert PhaseSchedule
// `time` (HH:MM string) to `scheduleTimeUTC` (minutes from midnight UTC).
// Backfill timezone using date-based rules:
//   - Before 2026-02-12 → "Africa/Johannesburg"
//   - From 2026-02-12 onward → "Europe/Berlin"
// No index changes vs v10 — V11_STORES === V10_STORES.
realDb.version(11).stores(V11_STORES).upgrade(async (trans) => {
  const now = Date.now();

  // Helper: backfill timezone on a table using its primary timestamp field
  const backfillTimezone = async (
    tableName: string,
    timestampField = "timestamp",
  ) => {
    await trans.table(tableName).toCollection().modify((record: Record<string, unknown>) => {
      const ts = (record[timestampField] as number | undefined)
        ?? (record.createdAt as number | undefined)
        ?? now;
      record.timezone = getTimezoneForTimestamp(ts);
      record.updatedAt = now;
    });
  };

  // Backfill timezone on all health record tables
  await backfillTimezone("intakeRecords");
  await backfillTimezone("weightRecords");
  await backfillTimezone("bloodPressureRecords");
  await backfillTimezone("eatingRecords");
  await backfillTimezone("urinationRecords");
  await backfillTimezone("defecationRecords");

  // Backfill timezone on medication domain tables
  await backfillTimezone("prescriptions", "createdAt");
  await backfillTimezone("medicationPhases", "createdAt");
  await backfillTimezone("inventoryItems", "createdAt");
  await backfillTimezone("inventoryTransactions");
  await backfillTimezone("doseLogs", "actionTimestamp");
  await backfillTimezone("dailyNotes", "createdAt");
  await backfillTimezone("auditLogs");

  // PhaseSchedule: backfill timezone AND convert time → scheduleTimeUTC
  await trans.table("phaseSchedules").toCollection().modify((record: Record<string, unknown>) => {
    const ts = (record.createdAt as number | undefined) ?? now;
    const tz = getTimezoneForTimestamp(ts);
    record.timezone = tz;
    record.anchorTimezone = tz;

    // Convert "HH:MM" string to UTC minutes using the backfilled timezone
    const timeStr = record.time as string | undefined;
    if (timeStr && typeof timeStr === "string" && timeStr.includes(":")) {
      record.scheduleTimeUTC = localHHMMStringToUTCMinutes(timeStr, tz);
    } else {
      // Fallback: default to 0 (midnight UTC) if time is missing/invalid
      record.scheduleTimeUTC = 0;
    }

    record.updatedAt = now;
  });
});

// Version 12: Add substanceRecords table for structured caffeine/alcohol tracking.
// Migrates existing intake records that contain caffeine/alcohol keywords in their
// `note` field into new SubstanceRecord entries with default estimated amounts.
// No network calls — AI enrichment (Pass 2) happens post-load in the client.

const CAFFEINE_KEYWORDS = ['coffee', 'espresso', 'tea', 'caffeine', 'matcha', 'latte', 'cappuccino'] as const;
const ALCOHOL_KEYWORDS = ['beer', 'wine', 'whiskey', 'whisky', 'vodka', 'gin', 'rum', 'cocktail', 'spirit', 'alcohol', 'brandy'] as const;

const DEFAULT_CAFFEINE_MG: Record<string, number> = {
  coffee: 95, espresso: 63, tea: 47, latte: 95, cappuccino: 95, matcha: 70,
};
const DEFAULT_CAFFEINE_VOLUME_ML: Record<string, number> = {
  coffee: 250, espresso: 30, tea: 250, latte: 350, cappuccino: 250, matcha: 250,
};
const DEFAULT_ALCOHOL_DRINKS: Record<string, number> = {
  beer: 1, wine: 1, cocktail: 1.5,
};

realDb.version(12).stores(V12_STORES).upgrade(async (trans) => {
  const intakeRecords = await trans.table("intakeRecords").toArray();
  const substanceTable = trans.table("substanceRecords");

  for (const record of intakeRecords) {
    const note = (record.note ?? "").toLowerCase();
    if (!note) continue;

    // Check caffeine keywords
    const caffeineMatch = CAFFEINE_KEYWORDS.find((kw) => note.includes(kw));
    if (caffeineMatch) {
      await substanceTable.add({
        id: crypto.randomUUID(),
        type: "caffeine",
        amountMg: DEFAULT_CAFFEINE_MG[caffeineMatch] ?? 95,
        volumeMl: DEFAULT_CAFFEINE_VOLUME_ML[caffeineMatch] ?? 250,
        description: record.note ?? caffeineMatch,
        source: "water_intake",
        sourceRecordId: record.id,
        aiEnriched: false,
        timestamp: record.timestamp,
        createdAt: record.createdAt ?? record.timestamp,
        updatedAt: record.updatedAt ?? record.timestamp,
        deletedAt: record.deletedAt ?? null,
        deviceId: record.deviceId ?? "migrated-v12",
        timezone: record.timezone ?? "UTC",
      });
      continue; // Only create one substance record per intake record
    }

    // Check alcohol keywords
    const alcoholMatch = ALCOHOL_KEYWORDS.find((kw) => note.includes(kw));
    if (alcoholMatch) {
      await substanceTable.add({
        id: crypto.randomUUID(),
        type: "alcohol",
        amountStandardDrinks: DEFAULT_ALCOHOL_DRINKS[alcoholMatch] ?? 1,
        description: record.note ?? alcoholMatch,
        source: "water_intake",
        sourceRecordId: record.id,
        aiEnriched: false,
        timestamp: record.timestamp,
        createdAt: record.createdAt ?? record.timestamp,
        updatedAt: record.updatedAt ?? record.timestamp,
        deletedAt: record.deletedAt ?? null,
        deviceId: record.deviceId ?? "migrated-v12",
        timezone: record.timezone ?? "UTC",
      });
    }
  }
});

// Version 13: Add createdAt index to prescriptions table.
// Fixes "KeyPath createdAt on object store prescriptions is not indexed" error
// when getPrescriptions() calls orderBy('createdAt'). No upgrade function needed —
// Dexie auto-creates the index from existing data.
realDb.version(13).stores(V13_STORES);

// Version 14: Add titrationPlans table and titrationPlanId index on medicationPhases.
// Titration plans group cross-prescription dosage adjustments for a condition.
// No data migration needed — new tables only.
realDb.version(14).stores(V14_STORES);

// Version 15: Add groupId index to intakeRecords, eatingRecords, substanceRecords.
// Enables composable entry queries — records sharing a groupId form an atomic group.
// No .upgrade() needed — existing records have undefined groupId, which IndexedDB
// excludes from index entries. Zero backfill required.
realDb.version(15).stores(V15_STORES);

// Version 16: Add _syncQueue (op-log) and _syncMeta (cursor map) tables
// to support the bidirectional sync engine (Phase 43, D-15).
// No changes to the 16 data tables — their createdAt/updatedAt/deletedAt/
// deviceId sync scaffolding (Dexie v10) is already sufficient.
// Dexie requires the FULL schema per version; omission drops a store.
realDb.version(16).stores({
  // --- REPEAT all v15 stores verbatim (PITFALL 5: omission drops data) ---
  intakeRecords:           "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  weightRecords:           "id, timestamp, updatedAt",
  bloodPressureRecords:    "id, timestamp, position, arm, updatedAt",
  eatingRecords:           "id, timestamp, groupId, updatedAt",
  urinationRecords:        "id, timestamp, updatedAt",
  defecationRecords:       "id, timestamp, updatedAt",
  prescriptions:           "id, isActive, updatedAt, createdAt",
  medicationPhases:        "id, prescriptionId, status, type, titrationPlanId, updatedAt",
  phaseSchedules:          "id, phaseId, time, enabled, updatedAt",
  inventoryItems:          "id, prescriptionId, isActive, updatedAt",
  inventoryTransactions:   "id, [inventoryItemId+timestamp], inventoryItemId, timestamp, type, updatedAt",
  doseLogs:                "id, [prescriptionId+scheduledDate], prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status, updatedAt",
  dailyNotes:              "id, date, prescriptionId, doseLogId, updatedAt",
  auditLogs:               "id, [action+timestamp], timestamp, action",
  substanceRecords:        "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",
  titrationPlans:          "id, conditionLabel, status, updatedAt",
  // --- NEW in v16 ---
  // `++id` = auto-increment; `[tableName+recordId]` = compound index for coalesce (D-04)
  _syncQueue:              "++id, [tableName+recordId], tableName, enqueuedAt",
  _syncMeta:               "tableName",
});

// Version 17: Add _errorLogs for device-local debug capture (window errors,
// unhandled rejections, ErrorBoundary catches, console.error/warn). Not synced,
// not backed up — purely a diagnostic surface for the Debug panel.
realDb.version(17).stores({
  // --- REPEAT all v16 stores verbatim ---
  intakeRecords:           "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  weightRecords:           "id, timestamp, updatedAt",
  bloodPressureRecords:    "id, timestamp, position, arm, updatedAt",
  eatingRecords:           "id, timestamp, groupId, updatedAt",
  urinationRecords:        "id, timestamp, updatedAt",
  defecationRecords:       "id, timestamp, updatedAt",
  prescriptions:           "id, isActive, updatedAt, createdAt",
  medicationPhases:        "id, prescriptionId, status, type, titrationPlanId, updatedAt",
  phaseSchedules:          "id, phaseId, time, enabled, updatedAt",
  inventoryItems:          "id, prescriptionId, isActive, updatedAt",
  inventoryTransactions:   "id, [inventoryItemId+timestamp], inventoryItemId, timestamp, type, updatedAt",
  doseLogs:                "id, [prescriptionId+scheduledDate], prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status, updatedAt",
  dailyNotes:              "id, date, prescriptionId, doseLogId, updatedAt",
  auditLogs:               "id, [action+timestamp], timestamp, action",
  substanceRecords:        "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",
  titrationPlans:          "id, conditionLabel, status, updatedAt",
  _syncQueue:              "++id, [tableName+recordId], tableName, enqueuedAt",
  _syncMeta:               "tableName",
  // --- NEW in v17 ---
  _errorLogs:              "id, timestamp, source",
});

// Version 18: Add userProfile — a store for the user's medical profile
// (conditions + AI-sharing opt-ins). Registered with the sync engine
// (TABLE_PUSH_ORDER / sync-payload) and the backup service. New table only,
// so no upgrade function is required.
realDb.version(18).stores({
  // --- REPEAT all v17 stores verbatim ---
  intakeRecords:           "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  weightRecords:           "id, timestamp, updatedAt",
  bloodPressureRecords:    "id, timestamp, position, arm, updatedAt",
  eatingRecords:           "id, timestamp, groupId, updatedAt",
  urinationRecords:        "id, timestamp, updatedAt",
  defecationRecords:       "id, timestamp, updatedAt",
  prescriptions:           "id, isActive, updatedAt, createdAt",
  medicationPhases:        "id, prescriptionId, status, type, titrationPlanId, updatedAt",
  phaseSchedules:          "id, phaseId, time, enabled, updatedAt",
  inventoryItems:          "id, prescriptionId, isActive, updatedAt",
  inventoryTransactions:   "id, [inventoryItemId+timestamp], inventoryItemId, timestamp, type, updatedAt",
  doseLogs:                "id, [prescriptionId+scheduledDate], prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status, updatedAt",
  dailyNotes:              "id, date, prescriptionId, doseLogId, updatedAt",
  auditLogs:               "id, [action+timestamp], timestamp, action",
  substanceRecords:        "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",
  titrationPlans:          "id, conditionLabel, status, updatedAt",
  _syncQueue:              "++id, [tableName+recordId], tableName, enqueuedAt",
  _syncMeta:               "tableName",
  _errorLogs:              "id, timestamp, source",
  // --- NEW in v18 ---
  userProfile:             "id, updatedAt",
});

// Version 19: Add insightReports — a store for cached AI analytics insight
// reports (narrative + observations per generated summary). Registered with
// the sync engine (TABLE_PUSH_ORDER / sync-payload) and the backup service.
// New table only, so no upgrade function is required.
realDb.version(19).stores({
  // --- REPEAT all v18 stores verbatim ---
  intakeRecords:           "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  weightRecords:           "id, timestamp, updatedAt",
  bloodPressureRecords:    "id, timestamp, position, arm, updatedAt",
  eatingRecords:           "id, timestamp, groupId, updatedAt",
  urinationRecords:        "id, timestamp, updatedAt",
  defecationRecords:       "id, timestamp, updatedAt",
  prescriptions:           "id, isActive, updatedAt, createdAt",
  medicationPhases:        "id, prescriptionId, status, type, titrationPlanId, updatedAt",
  phaseSchedules:          "id, phaseId, time, enabled, updatedAt",
  inventoryItems:          "id, prescriptionId, isActive, updatedAt",
  inventoryTransactions:   "id, [inventoryItemId+timestamp], inventoryItemId, timestamp, type, updatedAt",
  doseLogs:                "id, [prescriptionId+scheduledDate], prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status, updatedAt",
  dailyNotes:              "id, date, prescriptionId, doseLogId, updatedAt",
  auditLogs:               "id, [action+timestamp], timestamp, action",
  substanceRecords:        "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",
  titrationPlans:          "id, conditionLabel, status, updatedAt",
  _syncQueue:              "++id, [tableName+recordId], tableName, enqueuedAt",
  _syncMeta:               "tableName",
  _errorLogs:              "id, timestamp, source",
  userProfile:             "id, updatedAt",
  // --- NEW in v19 ---
  insightReports:          "id, generatedAt, updatedAt",
});

// Version 21: Add `sources` field to InsightReport for deep-mode reports
// that cite URLs via web_search. No new Dexie index — `sources` is a
// display field, not queryable. Stores byte-identical to v20; the version
// bump exists so the sync layer recognises the new field.
realDb.version(21).stores({
  // --- REPEAT all v20 stores verbatim ---
  intakeRecords:           "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  weightRecords:           "id, timestamp, updatedAt",
  bloodPressureRecords:    "id, timestamp, position, arm, updatedAt",
  eatingRecords:           "id, timestamp, groupId, updatedAt",
  urinationRecords:        "id, timestamp, updatedAt",
  defecationRecords:       "id, timestamp, updatedAt",
  prescriptions:           "id, isActive, updatedAt, createdAt",
  medicationPhases:        "id, prescriptionId, status, type, titrationPlanId, updatedAt",
  phaseSchedules:          "id, phaseId, time, enabled, updatedAt",
  inventoryItems:          "id, prescriptionId, isActive, updatedAt",
  inventoryTransactions:   "id, [inventoryItemId+timestamp], inventoryItemId, timestamp, type, updatedAt",
  doseLogs:                "id, [prescriptionId+scheduledDate], prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status, updatedAt",
  dailyNotes:              "id, date, prescriptionId, doseLogId, updatedAt",
  auditLogs:               "id, [action+timestamp], timestamp, action",
  substanceRecords:        "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",
  titrationPlans:          "id, conditionLabel, status, updatedAt",
  _syncQueue:              "++id, [tableName+recordId], tableName, enqueuedAt",
  _syncMeta:               "tableName",
  _errorLogs:              "id, timestamp, source",
  userProfile:             "id, updatedAt",
  insightReports:          "id, generatedAt, updatedAt",
});

// Version 20: Add `mode` field to InsightReport ("fast" | "deep"). No new
// Dexie index — `mode` is a filter/display field, not a query key — so the
// stores definition is byte-identical to v19. The Dexie version bump still
// has to happen because the interface gained a field and the sync layer
// needs to push/pull it.
realDb.version(20).stores({
  // --- REPEAT all v19 stores verbatim ---
  intakeRecords:           "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  weightRecords:           "id, timestamp, updatedAt",
  bloodPressureRecords:    "id, timestamp, position, arm, updatedAt",
  eatingRecords:           "id, timestamp, groupId, updatedAt",
  urinationRecords:        "id, timestamp, updatedAt",
  defecationRecords:       "id, timestamp, updatedAt",
  prescriptions:           "id, isActive, updatedAt, createdAt",
  medicationPhases:        "id, prescriptionId, status, type, titrationPlanId, updatedAt",
  phaseSchedules:          "id, phaseId, time, enabled, updatedAt",
  inventoryItems:          "id, prescriptionId, isActive, updatedAt",
  inventoryTransactions:   "id, [inventoryItemId+timestamp], inventoryItemId, timestamp, type, updatedAt",
  doseLogs:                "id, [prescriptionId+scheduledDate], prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status, updatedAt",
  dailyNotes:              "id, date, prescriptionId, doseLogId, updatedAt",
  auditLogs:               "id, [action+timestamp], timestamp, action",
  substanceRecords:        "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",
  titrationPlans:          "id, conditionLabel, status, updatedAt",
  _syncQueue:              "++id, [tableName+recordId], tableName, enqueuedAt",
  _syncMeta:               "tableName",
  _errorLogs:              "id, timestamp, source",
  userProfile:             "id, updatedAt",
  insightReports:          "id, generatedAt, updatedAt",
});

/**
 * Current Dexie schema version. Bump this constant in lockstep with each new
 * `realDb.version(N)` block above so diagnostic surfaces (Debug → Environment)
 * always reflect the real schema.
 */
export const DB_SCHEMA_VERSION = 21;

/**
 * Store definitions for a preview database — the current (v19) schema in a
 * single version. A preview database is created empty and discarded, so it
 * needs no migration history.
 */
const PREVIEW_STORES = {
  ...V15_STORES,
  _syncQueue: "++id, [tableName+recordId], tableName, enqueuedAt",
  _syncMeta: "tableName",
  _errorLogs: "id, timestamp, source",
  userProfile: "id, updatedAt",
  insightReports: "id, generatedAt, updatedAt",
} as const;

let previewDbCounter = 0;

/**
 * Create a fresh, isolated database for an in-app component preview. It has
 * the current schema and a unique name, and holds no data until seeded. Pair
 * with `setActiveDatabase` / `resetActiveDatabase`.
 */
export function createPreviewDatabase(): AppDatabase {
  previewDbCounter += 1;
  const preview = new Dexie(
    `IntakeTrackerPreviewDB-${previewDbCounter}`,
  ) as AppDatabase;
  preview.version(DB_SCHEMA_VERSION).stores(PREVIEW_STORES);
  return preview;
}

/** Point every `db` consumer at `next` — used by component previews. */
export function setActiveDatabase(next: AppDatabase): void {
  db = next;
}

/** Restore the real database after a preview is torn down. */
export function resetActiveDatabase(): void {
  db = realDb;
}
