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
  position: "standing" | "sitting";
  arm: "left" | "right";
  timestamp: number;
  note?: string;
}

export interface LocalSettings {
  id: string; // "settings" - singleton
  waterLimit: number;
  saltLimit: number;
  waterIncrement: number;
  saltIncrement: number;
  dayStartHour: number;
  dataRetentionDays: number;
  updatedAt: number;
}

const db = new Dexie("IntakeTrackerDB") as Dexie & {
  intakeRecords: EntityTable<IntakeRecord, "id">;
  auditLogs: EntityTable<AuditLog, "id">;
  weightRecords: EntityTable<WeightRecord, "id">;
  bloodPressureRecords: EntityTable<BloodPressureRecord, "id">;
  localSettings: EntityTable<LocalSettings, "id">;
};

// Version 1: Initial schema
// Version 2: Added audit logs
// Version 3: Added weight and blood pressure records
// Version 4: Added optional note field to IntakeRecord (no index needed)
// Version 5: Added localSettings for syncable settings in local mode
db.version(4).stores({
  intakeRecords: "id, type, timestamp, source",
  auditLogs: "id, timestamp, action",
  weightRecords: "id, timestamp",
  bloodPressureRecords: "id, timestamp, position, arm",
});
db.version(5).stores({
  intakeRecords: "id, type, timestamp, source",
  auditLogs: "id, timestamp, action",
  weightRecords: "id, timestamp",
  bloodPressureRecords: "id, timestamp, position, arm",
  localSettings: "id",
});

export { db };
