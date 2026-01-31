import Dexie, { type EntityTable } from "dexie";

export interface IntakeRecord {
  id: string;
  type: "water" | "salt";
  amount: number; // ml for water, mg for salt
  timestamp: number; // Unix timestamp in milliseconds
  source?: string; // "manual", "food:apple", "voice", etc.
}

export interface AuditLog {
  id: string;
  timestamp: number;
  action: string;
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

const db = new Dexie("IntakeTrackerDB") as Dexie & {
  intakeRecords: EntityTable<IntakeRecord, "id">;
  auditLogs: EntityTable<AuditLog, "id">;
  weightRecords: EntityTable<WeightRecord, "id">;
  bloodPressureRecords: EntityTable<BloodPressureRecord, "id">;
};

// Version 1: Initial schema
// Version 2: Added audit logs
// Version 3: Added weight and blood pressure records
db.version(3).stores({
  intakeRecords: "id, type, timestamp, source",
  auditLogs: "id, timestamp, action",
  weightRecords: "id, timestamp",
  bloodPressureRecords: "id, timestamp, position, arm",
});

export { db };
