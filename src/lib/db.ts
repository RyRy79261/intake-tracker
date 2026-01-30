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

const db = new Dexie("IntakeTrackerDB") as Dexie & {
  intakeRecords: EntityTable<IntakeRecord, "id">;
  auditLogs: EntityTable<AuditLog, "id">;
};

// Version 1: Initial schema
// Version 2: Added audit logs
db.version(2).stores({
  intakeRecords: "id, type, timestamp, source",
  auditLogs: "id, timestamp, action",
});

export { db };
