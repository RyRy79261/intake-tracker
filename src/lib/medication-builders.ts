import { type Prescription, type MedicationPhase, type InventoryItem, type PhaseSchedule, type PillShape, type FoodInstruction, type InventoryTransaction } from "./db";
import { syncFields } from "./utils";
import { getDeviceTimezone, localHHMMStringToUTCMinutes } from "./timezone";

export function buildPrescription(
  input: { genericName: string; indication: string; notes?: string; contraindications?: string[]; warnings?: string[] },
  now: number,
): Prescription {
  const sf = syncFields();
  return {
    id: crypto.randomUUID(),
    genericName: input.genericName,
    indication: input.indication,
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.contraindications !== undefined && { contraindications: input.contraindications }),
    ...(input.warnings !== undefined && { warnings: input.warnings }),
    isActive: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: sf.deviceId,
  };
}

export function buildPhase(
  prescriptionId: string,
  input: { unit: string; foodInstruction: FoodInstruction; foodNote?: string; type?: "maintenance" | "titration"; startDate?: number; endDate?: number; notes?: string; status?: "active" | "pending" },
  now: number,
): MedicationPhase {
  const sf = syncFields();
  return {
    id: crypto.randomUUID(),
    prescriptionId,
    type: input.type ?? "maintenance",
    unit: input.unit,
    startDate: input.startDate ?? now,
    ...(input.endDate !== undefined && { endDate: input.endDate }),
    foodInstruction: input.foodInstruction,
    ...(input.foodNote !== undefined && { foodNote: input.foodNote }),
    ...(input.notes !== undefined && { notes: input.notes }),
    status: input.status ?? "active",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: sf.deviceId,
  };
}

export function buildInventory(
  prescriptionId: string,
  input: { brandName: string; currentStock: number; strength: number; unit: string; pillShape: PillShape; pillColor: string; visualIdentification?: string; refillAlertDays?: number; refillAlertPills?: number },
  now: number,
): InventoryItem {
  const sf = syncFields();
  return {
    id: crypto.randomUUID(),
    prescriptionId,
    brandName: input.brandName,
    currentStock: input.currentStock,
    strength: input.strength,
    unit: input.unit,
    pillShape: input.pillShape,
    pillColor: input.pillColor,
    ...(input.visualIdentification !== undefined && { visualIdentification: input.visualIdentification }),
    ...(input.refillAlertDays !== undefined && { refillAlertDays: input.refillAlertDays }),
    ...(input.refillAlertPills !== undefined && { refillAlertPills: input.refillAlertPills }),
    isActive: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: sf.deviceId,
    timezone: sf.timezone,
  };
}

export function buildSchedules(
  phaseId: string,
  schedules: { time: string; daysOfWeek: number[]; dosage: number }[],
  now: number,
): PhaseSchedule[] {
  const sf = syncFields();
  const tz = getDeviceTimezone();
  return schedules.map(s => ({
    id: crypto.randomUUID(),
    phaseId,
    time: s.time,
    scheduleTimeUTC: localHHMMStringToUTCMinutes(s.time, tz),
    anchorTimezone: tz,
    dosage: s.dosage,
    daysOfWeek: s.daysOfWeek,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: sf.deviceId,
  }));
}

export function buildTransaction(
  inventoryItemId: string,
  amount: number,
  type: InventoryTransaction["type"],
  now: number,
  note?: string,
): InventoryTransaction {
  const sf = syncFields();
  return {
    id: crypto.randomUUID(),
    inventoryItemId,
    timestamp: now,
    amount,
    type,
    ...(note !== undefined && { note }),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: sf.deviceId,
    timezone: sf.timezone,
  };
}
