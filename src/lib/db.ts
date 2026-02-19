import Dexie, { type EntityTable } from "dexie";

export interface IntakeRecord {
  id: string;
  type: "water" | "salt";
  amount: number; // ml for water, mg for salt
  timestamp: number; // Unix timestamp in milliseconds
  source?: string; // "manual", "food:apple", "voice", etc.
  note?: string; // Optional note for the entry
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
  | "pin_verify_failure";

export interface AuditLog {
  id: string;
  timestamp: number;
  action: AuditAction;
  details?: string;
}

export interface WeightRecord {
  id: string;
  weight: number; // in kg
  timestamp: number;
  note?: string;
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
}

export interface EatingRecord {
  id: string;
  timestamp: number;
  grams?: number; // optional weight in grams
  note?: string;
}

export interface UrinationRecord {
  id: string;
  timestamp: number;
  amountEstimate?: string;
  note?: string;
}

export interface DefecationRecord {
  id: string;
  timestamp: number;
  amountEstimate?: string; // "small" | "medium" | "large"
  note?: string;
}

export type PillShape = "round" | "oval" | "capsule" | "diamond" | "tablet";
export type FoodInstruction = "before" | "after" | "none";
export type DoseStatus = "taken" | "skipped" | "rescheduled" | "pending";

export interface Medication {
  id: string;
  brandName: string;
  genericName: string;
  dosageStrength: string;
  dosageAmount: number;
  pillShape: PillShape;
  pillColor: string;
  indication: string;
  foodInstruction: FoodInstruction;
  foodNote?: string;
  currentStock: number;
  refillAlertDays?: number;
  refillAlertPills?: number;
  isActive: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MedicationSchedule {
  id: string;
  medicationId: string;
  time: string;
  daysOfWeek: number[];
  enabled: boolean;
  createdAt: number;
}

export interface DoseLog {
  id: string;
  medicationId: string;
  scheduleId: string;
  scheduledDate: string;
  scheduledTime: string;
  status: DoseStatus;
  actionTimestamp?: number;
  rescheduledTo?: string;
  skipReason?: string;
  note?: string;
}

const db = new Dexie("IntakeTrackerDB") as Dexie & {
  intakeRecords: EntityTable<IntakeRecord, "id">;
  auditLogs: EntityTable<AuditLog, "id">;
  weightRecords: EntityTable<WeightRecord, "id">;
  bloodPressureRecords: EntityTable<BloodPressureRecord, "id">;
  eatingRecords: EntityTable<EatingRecord, "id">;
  urinationRecords: EntityTable<UrinationRecord, "id">;
  defecationRecords: EntityTable<DefecationRecord, "id">;
  medications: EntityTable<Medication, "id">;
  medicationSchedules: EntityTable<MedicationSchedule, "id">;
  doseLogs: EntityTable<DoseLog, "id">;
};

// Version 1: Initial schema
// Version 2: Added audit logs
// Version 3: Added weight and blood pressure records
// Version 4: Added optional note field to IntakeRecord (no index needed)
db.version(4).stores({
  intakeRecords: "id, type, timestamp, source",
  auditLogs: "id, timestamp, action",
  weightRecords: "id, timestamp",
  bloodPressureRecords: "id, timestamp, position, arm",
});
// Version 5: Added eating and urination records (additive only; existing stores unchanged)
db.version(5).stores({
  intakeRecords: "id, type, timestamp, source",
  auditLogs: "id, timestamp, action",
  weightRecords: "id, timestamp",
  bloodPressureRecords: "id, timestamp, position, arm",
  eatingRecords: "id, timestamp",
  urinationRecords: "id, timestamp",
});
// Version 6: Added defecation records
db.version(6).stores({
  intakeRecords: "id, type, timestamp, source",
  auditLogs: "id, timestamp, action",
  weightRecords: "id, timestamp",
  bloodPressureRecords: "id, timestamp, position, arm",
  eatingRecords: "id, timestamp",
  urinationRecords: "id, timestamp",
  defecationRecords: "id, timestamp",
});
// Version 7: Added medication tracking tables
db.version(7).stores({
  intakeRecords: "id, type, timestamp, source",
  auditLogs: "id, timestamp, action",
  weightRecords: "id, timestamp",
  bloodPressureRecords: "id, timestamp, position, arm",
  eatingRecords: "id, timestamp",
  urinationRecords: "id, timestamp",
  defecationRecords: "id, timestamp",
  medications: "id, isActive, createdAt",
  medicationSchedules: "id, medicationId, time, enabled",
  doseLogs: "id, medicationId, scheduleId, scheduledDate, scheduledTime, status",
});

export { db };
