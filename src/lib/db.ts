import Dexie, { type EntityTable } from "dexie";

export interface IntakeRecord {
  id: string;
  type: "water" | "salt";
  amount: number; // ml for water, mg for salt
  timestamp: number; // Unix timestamp in milliseconds
  source?: string; // "manual", "food:apple", "voice", etc.
  note?: string; // Optional note for the entry
  createdAt: number; // Unix ms — set once on creation
  updatedAt: number; // Unix ms — updated on every mutation
  deletedAt: number | null; // null = active, number = soft-deleted timestamp
  deviceId: string; // device identifier for sync conflict resolution
}

export type AuditAction =
  | "ai_parse_request"
  | "ai_parse_success"
  | "ai_parse_error"
  | "data_export"
  | "data_import"
  | "data_clear"
  | "settings_change"
  | "api_key_set"
  | "api_key_clear"
  | "pin_set"
  | "pin_verify_success"
  | "pin_verify_failure"
  | "dose_taken"
  | "dose_skipped"
  | "dose_rescheduled"
  | "prescription_added"
  | "prescription_updated"
  | "inventory_adjusted"
  | "phase_activated";

export interface AuditLog {
  id: string;
  timestamp: number;
  action: AuditAction;
  details?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface WeightRecord {
  id: string;
  weight: number; // in kg
  timestamp: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface BloodPressureRecord {
  id: string;
  systolic: number; // top number (mmHg)
  diastolic: number; // bottom number (mmHg)
  heartRate?: number; // BPM (optional)
  irregularHeartbeat?: boolean; // optional flag for irregular heartbeat
  position: "standing" | "sitting";
  arm: "left" | "right";
  timestamp: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface EatingRecord {
  id: string;
  timestamp: number;
  grams?: number; // optional weight in grams
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface UrinationRecord {
  id: string;
  timestamp: number;
  amountEstimate?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface DefecationRecord {
  id: string;
  timestamp: number;
  amountEstimate?: string; // "small" | "medium" | "large"
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export type PillShape = "round" | "oval" | "capsule" | "diamond" | "tablet";
export type FoodInstruction = "before" | "after" | "none";
export type DoseStatus = "taken" | "skipped" | "rescheduled" | "pending";

export interface Prescription {
  id: string;
  genericName: string;
  indication: string;
  notes?: string;
  contraindications?: string[];
  warnings?: string[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export type PhaseType = "maintenance" | "titration";

export interface MedicationPhase {
  id: string;
  prescriptionId: string;
  type: PhaseType;
  unit: string;
  startDate: number;
  endDate?: number;
  foodInstruction: FoodInstruction;
  foodNote?: string;
  notes?: string;
  status: "active" | "completed" | "cancelled" | "pending";
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface PhaseSchedule {
  id: string;
  phaseId: string;
  time: string;
  dosage: number;
  daysOfWeek: number[];
  enabled: boolean;
  unit?: string; // dosage unit for display, e.g. "mg"
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface InventoryItem {
  id: string;
  prescriptionId: string;
  brandName: string;
  /** @deprecated Use inventoryTransactions sum. Will be removed in Phase 3. */
  currentStock?: number;
  strength: number;
  unit: string;
  pillShape: PillShape;
  pillColor: string;
  visualIdentification?: string;
  refillAlertDays?: number;
  refillAlertPills?: number;
  isActive: boolean;
  isArchived?: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface InventoryTransaction {
  id: string;
  inventoryItemId: string;
  timestamp: number;
  amount: number;
  note?: string;
  type: "refill" | "consumed" | "adjusted" | "initial";
  doseLogId?: string; // links consumed transaction to the dose that caused it
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface DailyNote {
  id: string;
  date: string; // YYYY-MM-DD
  prescriptionId?: string;
  doseLogId?: string;
  note: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface DoseLog {
  id: string;
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  inventoryItemId?: string;
  scheduledDate: string;
  scheduledTime: string;
  status: DoseStatus;
  actionTimestamp?: number;
  rescheduledTo?: string;
  skipReason?: string;
  note?: string;
  timezone?: string; // IANA timezone string, e.g. "Africa/Johannesburg"
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

const db = new Dexie("IntakeTrackerDB") as Dexie & {
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
};

// Version 10: Consolidated schema with sync-readiness fields, compound indexes,
// and event-sourced inventory. Replaces v4-v9 (all prior migrations ran on
// production data and are no longer needed in code). Legacy `medications` and
// `medicationSchedules` tables intentionally omitted — Dexie will delete them.
db.version(10).stores({
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
}).upgrade(async (trans) => {
  const now = Date.now();
  const deviceId = "migrated-v10";

  // Helper: backfill sync fields on all records in a table
  const backfill = async (tableName: string, timestampField = "timestamp") => {
    await trans.table(tableName).toCollection().modify((record: any) => {
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

export { db };
