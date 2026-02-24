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
}

export type PhaseType = "maintenance" | "titration";

export interface MedicationPhase {
  id: string;
  prescriptionId: string;
  type: PhaseType;
  dosageAmount: number;
  dosageStrength: string;
  startDate: number;
  endDate?: number;
  foodInstruction: FoodInstruction;
  foodNote?: string;
  notes?: string;
  status: "active" | "completed" | "cancelled";
  createdAt: number;
}

export interface PhaseSchedule {
  id: string;
  phaseId: string;
  time: string;
  daysOfWeek: number[];
  enabled: boolean;
  createdAt: number;
}

export interface InventoryItem {
  id: string;
  prescriptionId: string;
  brandName: string;
  currentStock: number;
  pillShape: PillShape;
  pillColor: string;
  visualIdentification?: string;
  refillAlertDays?: number;
  refillAlertPills?: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DailyNote {
  id: string;
  date: string; // YYYY-MM-DD
  prescriptionId?: string;
  doseLogId?: string;
  note: string;
  createdAt: number;
  updatedAt: number;
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
}

const db = new Dexie("IntakeTrackerDB") as Dexie & {
  intakeRecords: EntityTable<IntakeRecord, "id">;
  auditLogs: EntityTable<AuditLog, "id">;
  weightRecords: EntityTable<WeightRecord, "id">;
  bloodPressureRecords: EntityTable<BloodPressureRecord, "id">;
  eatingRecords: EntityTable<EatingRecord, "id">;
  urinationRecords: EntityTable<UrinationRecord, "id">;
  defecationRecords: EntityTable<DefecationRecord, "id">;
  
  // Legacy tables for migration
  medications: EntityTable<any, "id">;
  medicationSchedules: EntityTable<any, "id">;
  
  // New tables
  prescriptions: EntityTable<Prescription, "id">;
  medicationPhases: EntityTable<MedicationPhase, "id">;
  phaseSchedules: EntityTable<PhaseSchedule, "id">;
  inventoryItems: EntityTable<InventoryItem, "id">;
  dailyNotes: EntityTable<DailyNote, "id">;
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
// Version 7: Added old medication tracking tables
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

// Version 8: Refactored medication tracking (Prescriptions, Phases, Inventory)
db.version(8).stores({
  prescriptions: "id, isActive, createdAt",
  medicationPhases: "id, prescriptionId, status, type",
  phaseSchedules: "id, phaseId, time, enabled",
  inventoryItems: "id, prescriptionId, isActive",
  dailyNotes: "id, date, prescriptionId, doseLogId",
  doseLogs: "id, prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status",
}).upgrade(async (trans) => {
  // Migrate existing medications
  const oldMeds = await trans.table("medications").toArray();
  const oldSchedules = await trans.table("medicationSchedules").toArray();
  const oldDoseLogs = await trans.table("doseLogs").toArray();
  
  for (const oldMed of oldMeds) {
    // Create Prescription
    const prescription: Prescription = {
      id: oldMed.id, // Keep the same ID for ease
      genericName: oldMed.genericName || oldMed.brandName || "Unknown",
      indication: oldMed.indication || "",
      notes: oldMed.notes,
      contraindications: oldMed.contraindications,
      warnings: oldMed.warnings,
      isActive: oldMed.isActive,
      createdAt: oldMed.createdAt,
      updatedAt: oldMed.updatedAt || oldMed.createdAt,
    };
    await trans.table("prescriptions").add(prescription);
    
    // Create initial MedicationPhase
    const phaseId = crypto.randomUUID();
    const phase: MedicationPhase = {
      id: phaseId,
      prescriptionId: prescription.id,
      type: "maintenance",
      dosageAmount: oldMed.dosageAmount || 1,
      dosageStrength: oldMed.dosageStrength || "",
      startDate: oldMed.createdAt,
      foodInstruction: oldMed.foodInstruction || "none",
      foodNote: oldMed.foodNote,
      status: "active",
      createdAt: oldMed.createdAt,
    };
    await trans.table("medicationPhases").add(phase);
    
    // Create InventoryItem
    const inventoryItemId = crypto.randomUUID();
    const inventory: InventoryItem = {
      id: inventoryItemId,
      prescriptionId: prescription.id,
      brandName: oldMed.brandName || oldMed.genericName || "Unknown",
      currentStock: oldMed.currentStock || 0,
      pillShape: oldMed.pillShape || "round",
      pillColor: oldMed.pillColor || "#FFFFFF",
      refillAlertDays: oldMed.refillAlertDays,
      refillAlertPills: oldMed.refillAlertPills,
      isActive: true,
      createdAt: oldMed.createdAt,
      updatedAt: oldMed.updatedAt || oldMed.createdAt,
    };
    await trans.table("inventoryItems").add(inventory);
    
    // Migrate schedules to phaseSchedules
    const schedulesForMed = oldSchedules.filter(s => s.medicationId === oldMed.id);
    for (const oldSched of schedulesForMed) {
      const phaseSchedule: PhaseSchedule = {
        id: oldSched.id, // Keep same ID so doseLogs still link (sort of)
        phaseId: phase.id,
        time: oldSched.time,
        daysOfWeek: oldSched.daysOfWeek || [],
        enabled: oldSched.enabled,
        createdAt: oldSched.createdAt,
      };
      await trans.table("phaseSchedules").add(phaseSchedule);
    }
  }
  
  // Migrate doseLogs (just update prescriptionId and phaseId where possible)
  for (const oldLog of oldDoseLogs) {
    // We kept the prescriptionId same as old medicationId
    // And phaseId we just created above for this med. We have to look it up.
    const phase = await trans.table("medicationPhases").where("prescriptionId").equals(oldLog.medicationId).first();
    if (phase) {
      oldLog.prescriptionId = oldLog.medicationId;
      oldLog.phaseId = phase.id;
      // scheduleId remains the same since we kept oldSched.id
      delete oldLog.medicationId;
      await trans.table("doseLogs").put(oldLog);
    }
  }
  
  // We can't actually delete tables in Dexie upgrade without losing data entirely if we downgrade,
  // but since we moved data to new tables, we can clear the old ones if we want, or just leave them.
  // We'll leave them empty to avoid issues.
  await trans.table("medications").clear();
  await trans.table("medicationSchedules").clear();
});

export { db };
