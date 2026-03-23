import { type IntakeRecord, type WeightRecord, type BloodPressureRecord,
  type EatingRecord, type UrinationRecord, type DefecationRecord,
  type Prescription, type MedicationPhase, type PhaseSchedule,
  type InventoryItem, type InventoryTransaction, type DoseLog,
  type DailyNote, type AuditLog, type SubstanceRecord, type TitrationPlan } from "@/lib/db";

const BASE_TS = 1700000000000; // 2023-11-14 — fixed base for determinism

export function makeIntakeRecord(overrides?: Partial<IntakeRecord>): IntakeRecord {
  return {
    id: crypto.randomUUID(),
    type: "water",
    amount: 250,
    timestamp: BASE_TS,
    source: "manual",
    note: undefined,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as IntakeRecord;
}

export function makeWeightRecord(overrides?: Partial<WeightRecord>): WeightRecord {
  return {
    id: crypto.randomUUID(),
    weight: 75.0,
    timestamp: BASE_TS,
    note: undefined,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as WeightRecord;
}

export function makeBloodPressureRecord(overrides?: Partial<BloodPressureRecord>): BloodPressureRecord {
  return {
    id: crypto.randomUUID(),
    systolic: 120,
    diastolic: 80,
    heartRate: 70,
    irregularHeartbeat: false,
    position: "sitting",
    arm: "left",
    timestamp: BASE_TS,
    note: undefined,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as BloodPressureRecord;
}

export function makeEatingRecord(overrides?: Partial<EatingRecord>): EatingRecord {
  return {
    id: crypto.randomUUID(),
    timestamp: BASE_TS,
    grams: 200,
    note: undefined,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as EatingRecord;
}

export function makeUrinationRecord(overrides?: Partial<UrinationRecord>): UrinationRecord {
  return {
    id: crypto.randomUUID(),
    timestamp: BASE_TS,
    amountEstimate: "medium",
    note: undefined,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as UrinationRecord;
}

export function makeDefecationRecord(overrides?: Partial<DefecationRecord>): DefecationRecord {
  return {
    id: crypto.randomUUID(),
    timestamp: BASE_TS,
    amountEstimate: "medium",
    note: undefined,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as DefecationRecord;
}

export function makePrescription(overrides?: Partial<Prescription>): Prescription {
  return {
    id: crypto.randomUUID(),
    genericName: "Metoprolol",
    indication: "Hypertension",
    notes: undefined,
    contraindications: [],
    warnings: [],
    isActive: true,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as Prescription;
}

export function makeMedicationPhase(prescriptionId: string, overrides?: Partial<MedicationPhase>): MedicationPhase {
  return {
    id: crypto.randomUUID(),
    prescriptionId,
    type: "maintenance",
    unit: "mg",
    startDate: BASE_TS,
    endDate: undefined,
    foodInstruction: "none",
    foodNote: undefined,
    notes: undefined,
    status: "active",
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as MedicationPhase;
}

export function makePhaseSchedule(phaseId: string, overrides?: Partial<PhaseSchedule>): PhaseSchedule {
  return {
    id: crypto.randomUUID(),
    phaseId,
    time: "08:00",
    scheduleTimeUTC: 480, // 08:00 in minutes from midnight UTC
    anchorTimezone: "UTC",
    dosage: 50,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
    unit: "mg",
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as PhaseSchedule;
}

export function makeInventoryItem(prescriptionId: string, overrides?: Partial<InventoryItem>): InventoryItem {
  return {
    id: crypto.randomUUID(),
    prescriptionId,
    brandName: "Lopressor",
    strength: 50,
    unit: "mg",
    pillShape: "round",
    pillColor: "#FFFFFF",
    visualIdentification: undefined,
    refillAlertDays: 7,
    refillAlertPills: 14,
    isActive: true,
    isArchived: false,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as InventoryItem;
}

export function makeInventoryTransaction(inventoryItemId: string, overrides?: Partial<InventoryTransaction>): InventoryTransaction {
  return {
    id: crypto.randomUUID(),
    inventoryItemId,
    timestamp: BASE_TS,
    amount: 30,
    note: undefined,
    type: "initial",
    doseLogId: undefined,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as InventoryTransaction;
}

export function makeDoseLog(prescriptionId: string, phaseId: string, scheduleId: string, overrides?: Partial<DoseLog>): DoseLog {
  return {
    id: crypto.randomUUID(),
    prescriptionId,
    phaseId,
    scheduleId,
    inventoryItemId: undefined,
    scheduledDate: "2023-11-14",
    scheduledTime: "08:00",
    status: "pending",
    actionTimestamp: undefined,
    rescheduledTo: undefined,
    skipReason: undefined,
    note: undefined,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    timezone: "UTC",
    ...overrides,
  } as DoseLog;
}

export function makeDailyNote(overrides?: Partial<DailyNote>): DailyNote {
  return {
    id: crypto.randomUUID(),
    date: "2023-11-14",
    prescriptionId: undefined,
    doseLogId: undefined,
    note: "Test note",
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as DailyNote;
}

export function makeAuditLog(overrides?: Partial<AuditLog>): AuditLog {
  return {
    id: crypto.randomUUID(),
    timestamp: BASE_TS,
    action: "settings_change",
    details: "Test audit event",
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as AuditLog;
}

export function makeTitrationPlan(overrides?: Partial<TitrationPlan>): TitrationPlan {
  return {
    id: crypto.randomUUID(),
    title: "Test Titration",
    conditionLabel: "Hypertension",
    recommendedStartDate: undefined,
    status: "planned",
    notes: undefined,
    warnings: [],
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    ...overrides,
  } as TitrationPlan;
}

export function makeSubstanceRecord(overrides?: Partial<SubstanceRecord>): SubstanceRecord {
  return {
    id: crypto.randomUUID(),
    type: "caffeine",
    amountMg: 95,
    volumeMl: 250,
    description: "Coffee",
    source: "standalone",
    aiEnriched: false,
    timestamp: BASE_TS,
    createdAt: BASE_TS,
    updatedAt: BASE_TS,
    deletedAt: null,
    deviceId: "test-device",
    timezone: "UTC",
    ...overrides,
  } as SubstanceRecord;
}
