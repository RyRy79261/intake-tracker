import { db, type Prescription, type MedicationPhase, type InventoryItem, type PhaseSchedule, type PillShape, type FoodInstruction } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { syncFields } from "./utils";
import { getDeviceTimezone, localHHMMStringToUTCMinutes } from "./timezone";

export interface CreatePrescriptionInput {
  // Prescription level
  genericName: string;
  indication: string;
  notes?: string;
  contraindications?: string[];
  warnings?: string[];

  // Phase level (initial maintenance phase)
  unit: string;
  foodInstruction: FoodInstruction;
  foodNote?: string;

  // Inventory level
  brandName: string;
  currentStock: number;
  strength: number;
  pillShape: PillShape;
  pillColor: string;
  visualIdentification?: string;
  refillAlertDays?: number;
  refillAlertPills?: number;

  // Schedules
  schedules: { time: string; daysOfWeek: number[], dosage: number }[];
}

function buildPrescription(input: CreatePrescriptionInput | { genericName: string; indication: string; notes?: string; contraindications?: string[]; warnings?: string[] }, now: number): Prescription {
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

function buildPhase(prescriptionId: string, input: { unit: string; foodInstruction: FoodInstruction; foodNote?: string; type?: "maintenance" | "titration"; startDate?: number; endDate?: number; notes?: string; status?: "active" | "pending" }, now: number): MedicationPhase {
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

function buildInventory(prescriptionId: string, input: { brandName: string; currentStock: number; strength: number; unit: string; pillShape: PillShape; pillColor: string; visualIdentification?: string; refillAlertDays?: number; refillAlertPills?: number }, now: number): InventoryItem {
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

function buildSchedules(phaseId: string, schedules: { time: string; daysOfWeek: number[]; dosage: number }[], now: number): PhaseSchedule[] {
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

function buildTransaction(inventoryItemId: string, amount: number, type: "refill" | "consumed" | "adjusted" | "initial", now: number, note?: string): {
  id: string; inventoryItemId: string; timestamp: number; amount: number; type: "refill" | "consumed" | "adjusted" | "initial"; createdAt: number; updatedAt: number; deletedAt: null; deviceId: string; timezone: string; note?: string;
} {
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

export async function addPrescription(input: CreatePrescriptionInput): Promise<ServiceResult<{
  prescription: Prescription;
  phase: MedicationPhase;
  inventory: InventoryItem;
  schedules: PhaseSchedule[];
}>> {
  try {
    const now = Date.now();

    const prescription = buildPrescription(input, now);
    const phase = buildPhase(prescription.id, input, now);
    const inventory = buildInventory(prescription.id, input, now);
    const schedules = buildSchedules(phase.id, input.schedules, now);

    await db.transaction("rw", [db.prescriptions, db.medicationPhases, db.inventoryItems, db.phaseSchedules, db.inventoryTransactions], async () => {
      await db.prescriptions.add(prescription);
      await db.medicationPhases.add(phase);
      await db.inventoryItems.add(inventory);
      await db.phaseSchedules.bulkAdd(schedules);

      if (input.currentStock > 0) {
        await db.inventoryTransactions.add(buildTransaction(inventory.id, input.currentStock, "refill", now, "Initial stock"));
      }
    });

    return ok({ prescription, phase, inventory, schedules });
  } catch (e) {
    return err("Failed to add prescription", e);
  }
}

export interface AddMedicationToPrescriptionInput {
  prescriptionId: string;
  unit: string;
  foodInstruction: FoodInstruction;
  foodNote?: string;
  brandName: string;
  currentStock: number;
  strength: number;
  pillShape: PillShape;
  pillColor: string;
  visualIdentification?: string;
  refillAlertDays?: number;
  refillAlertPills?: number;
  schedules: { time: string; daysOfWeek: number[], dosage: number }[];
}

export async function addMedicationToPrescription(input: AddMedicationToPrescriptionInput): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    const phase = buildPhase(input.prescriptionId, input, now);
    const inventory = buildInventory(input.prescriptionId, input, now);
    const schedules = buildSchedules(phase.id, input.schedules, now);

    await db.transaction("rw", [db.medicationPhases, db.inventoryItems, db.phaseSchedules, db.inventoryTransactions], async () => {
      const existingInventory = await db.inventoryItems.where("prescriptionId").equals(input.prescriptionId).toArray();
      for (const item of existingInventory) {
        if (item.isActive) {
          await db.inventoryItems.update(item.id, { isActive: false, isArchived: true, updatedAt: now });
        }
      }

      const existingPhases = await db.medicationPhases.where("prescriptionId").equals(input.prescriptionId).toArray();
      for (const p of existingPhases) {
        if (p.status === "active") {
          await db.medicationPhases.update(p.id, { status: "completed", endDate: now });
        }
      }

      await db.medicationPhases.add(phase);
      await db.inventoryItems.add(inventory);
      await db.phaseSchedules.bulkAdd(schedules);

      if (input.currentStock > 0) {
        await db.inventoryTransactions.add(buildTransaction(inventory.id, input.currentStock, "refill", now, "Initial stock"));
      }
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to add medication to prescription", e);
  }
}

export async function updatePrescription(
  id: string,
  updates: Partial<Omit<Prescription, "id" | "createdAt">>
): Promise<ServiceResult<void>> {
  try {
    await db.prescriptions.update(id, { ...updates, updatedAt: Date.now() });
    return ok(undefined);
  } catch (e) {
    return err("Failed to update prescription", e);
  }
}

export async function deletePrescription(id: string): Promise<ServiceResult<void>> {
  try {
    await db.transaction("rw", [db.prescriptions, db.medicationPhases, db.phaseSchedules, db.inventoryItems, db.doseLogs], async () => {
      await db.doseLogs.where("prescriptionId").equals(id).delete();
      await db.inventoryItems.where("prescriptionId").equals(id).delete();
      const phases = await db.medicationPhases.where("prescriptionId").equals(id).toArray();
      for (const p of phases) {
        await db.phaseSchedules.where("phaseId").equals(p.id).delete();
      }
      await db.medicationPhases.where("prescriptionId").equals(id).delete();
      await db.prescriptions.delete(id);
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete prescription", e);
  }
}

export async function getPrescriptionById(id: string): Promise<ServiceResult<Prescription | undefined>> {
  try {
    const result = await db.prescriptions.get(id);
    return ok(result);
  } catch (e) {
    return err("Failed to get prescription", e);
  }
}

export async function getPrescriptions(): Promise<ServiceResult<Prescription[]>> {
  try {
    const records = await db.prescriptions.orderBy("createdAt").reverse().toArray();
    return ok(records);
  } catch (e) {
    return err("Failed to get prescriptions", e);
  }
}

export async function getActivePrescriptions(): Promise<ServiceResult<Prescription[]>> {
  try {
    const all = await db.prescriptions.toArray();
    return ok(all.filter(p => p.isActive));
  } catch (e) {
    return err("Failed to get active prescriptions", e);
  }
}

export async function getInactivePrescriptions(): Promise<ServiceResult<Prescription[]>> {
  try {
    const all = await db.prescriptions.toArray();
    return ok(all.filter(p => !p.isActive));
  } catch (e) {
    return err("Failed to get inactive prescriptions", e);
  }
}

export async function getInventoryForPrescription(prescriptionId: string): Promise<ServiceResult<InventoryItem[]>> {
  try {
    const items = await db.inventoryItems.where("prescriptionId").equals(prescriptionId).toArray();
    return ok(items);
  } catch (e) {
    return err("Failed to get inventory for prescription", e);
  }
}

export async function getActiveInventoryForPrescription(prescriptionId: string): Promise<ServiceResult<InventoryItem | undefined>> {
  try {
    const items = await db.inventoryItems.where("prescriptionId").equals(prescriptionId).toArray();
    return ok(items.find(i => i.isActive));
  } catch (e) {
    return err("Failed to get active inventory for prescription", e);
  }
}

export async function getAllInventoryItems(): Promise<ServiceResult<InventoryItem[]>> {
  try {
    const items = await db.inventoryItems.toArray();
    return ok(items);
  } catch (e) {
    return err("Failed to get all inventory items", e);
  }
}

export async function getAllActiveInventoryItems(): Promise<ServiceResult<InventoryItem[]>> {
  try {
    const all = await db.inventoryItems.toArray();
    return ok(all.filter(i => i.isActive));
  } catch (e) {
    return err("Failed to get all active inventory items", e);
  }
}

export async function addInventoryItem(input: Omit<InventoryItem, "id" | "createdAt" | "updatedAt" | "deletedAt" | "deviceId">): Promise<ServiceResult<InventoryItem>> {
  try {
    const item: InventoryItem = {
      ...input,
      id: crypto.randomUUID(),
      ...syncFields(),
    };
    await db.inventoryItems.add(item);
    return ok(item);
  } catch (e) {
    return err("Failed to add inventory item", e);
  }
}

export async function updateInventoryItem(
  id: string,
  updates: Partial<Omit<InventoryItem, "id" | "createdAt" | "prescriptionId">>
): Promise<ServiceResult<void>> {
  try {
    await db.inventoryItems.update(id, { ...updates, updatedAt: Date.now() });
    return ok(undefined);
  } catch (e) {
    return err("Failed to update inventory item", e);
  }
}

export async function deleteInventoryItem(id: string): Promise<ServiceResult<void>> {
  try {
    await db.inventoryItems.delete(id);
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete inventory item", e);
  }
}

export async function getActivePhaseForPrescription(prescriptionId: string): Promise<ServiceResult<MedicationPhase | undefined>> {
  try {
    const phases = await db.medicationPhases.where("prescriptionId").equals(prescriptionId).toArray();
    return ok(phases.find(p => p.status === "active"));
  } catch (e) {
    return err("Failed to get active phase for prescription", e);
  }
}

export async function getPhasesForPrescription(prescriptionId: string): Promise<ServiceResult<MedicationPhase[]>> {
  try {
    const phases = await db.medicationPhases.where("prescriptionId").equals(prescriptionId).reverse().sortBy("createdAt");
    return ok(phases);
  } catch (e) {
    return err("Failed to get phases for prescription", e);
  }
}

export async function adjustStock(
  inventoryItemId: string,
  delta: number,
  note?: string,
  type?: "refill" | "consumed" | "adjusted"
): Promise<ServiceResult<number>> {
  try {
    const item = await db.inventoryItems.get(inventoryItemId);
    if (!item) return err(`InventoryItem ${inventoryItemId} not found`);
    const currentStock = item.currentStock ?? 0;
    const newStock = Math.max(0, currentStock + delta);
    const now = Date.now();

    await db.transaction("rw", [db.inventoryItems, db.inventoryTransactions], async () => {
      await db.inventoryItems.update(inventoryItemId, { currentStock: newStock, updatedAt: now });
      await db.inventoryTransactions.add(buildTransaction(
        inventoryItemId,
        delta,
        type ?? (delta > 0 ? "refill" : "consumed"),
        now,
        note
      ));
    });

    return ok(newStock);
  } catch (e) {
    return err("Failed to adjust stock", e);
  }
}

export async function getInventoryTransactions(inventoryItemId: string): Promise<ServiceResult<import("./db").InventoryTransaction[]>> {
  try {
    const transactions = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(inventoryItemId)
      .reverse()
      .sortBy("timestamp");
    return ok(transactions);
  } catch (e) {
    return err("Failed to get inventory transactions", e);
  }
}

export interface CreatePhaseInput {
  prescriptionId: string;
  type: "maintenance" | "titration";
  unit: string;
  startDate: number;
  endDate?: number;
  foodInstruction: FoodInstruction;
  foodNote?: string;
  notes?: string;
  schedules: { time: string; daysOfWeek: number[], dosage: number }[];
}

export interface UpdatePhaseInput {
  id: string;
  type?: "maintenance" | "titration";
  unit?: string;
  startDate?: number;
  endDate?: number;
  foodInstruction?: FoodInstruction;
  foodNote?: string;
  notes?: string;
  status?: "active" | "completed" | "cancelled" | "pending";
  schedules?: { id?: string; time: string; daysOfWeek: number[], dosage: number }[];
}

export async function updatePhase(input: UpdatePhaseInput): Promise<ServiceResult<void>> {
  try {
    await db.transaction("rw", [db.medicationPhases, db.phaseSchedules], async () => {
      const { id, schedules, ...updates } = input;

      if (Object.keys(updates).length > 0) {
        await db.medicationPhases.update(id, updates);
      }

      if (schedules) {
        const existingSchedules = await db.phaseSchedules.where("phaseId").equals(id).toArray();
        const existingIds = new Set(existingSchedules.map(s => s.id));

        const toAdd: PhaseSchedule[] = [];
        const toUpdate: { id: string; time: string; daysOfWeek: number[]; dosage: number }[] = [];
        const keptIds = new Set<string>();

        for (const s of schedules) {
          if (s.id && existingIds.has(s.id)) {
            toUpdate.push({ id: s.id, time: s.time, daysOfWeek: s.daysOfWeek, dosage: s.dosage });
            keptIds.add(s.id);
          } else {
            const sf = syncFields();
            const tz = getDeviceTimezone();
            toAdd.push({
              id: crypto.randomUUID(),
              phaseId: id,
              time: s.time,
              scheduleTimeUTC: localHHMMStringToUTCMinutes(s.time, tz),
              anchorTimezone: tz,
              dosage: s.dosage,
              daysOfWeek: s.daysOfWeek,
              enabled: true,
              createdAt: sf.createdAt,
              updatedAt: sf.updatedAt,
              deletedAt: null,
              deviceId: sf.deviceId,
            });
          }
        }

        const toDelete = Array.from(existingIds).filter(sid => !keptIds.has(sid));

        if (toDelete.length > 0) await db.phaseSchedules.bulkDelete(toDelete);
        if (toAdd.length > 0) await db.phaseSchedules.bulkAdd(toAdd);
        for (const u of toUpdate) {
          await db.phaseSchedules.update(u.id, {
            time: u.time,
            dosage: u.dosage,
            daysOfWeek: u.daysOfWeek,
          });
        }
      }
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to update phase", e);
  }
}

export async function deletePhase(id: string): Promise<ServiceResult<void>> {
  try {
    await db.transaction("rw", [db.medicationPhases, db.phaseSchedules], async () => {
      await db.phaseSchedules.where("phaseId").equals(id).delete();
      await db.medicationPhases.delete(id);
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete phase", e);
  }
}

export async function activatePhase(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.transaction("rw", [db.medicationPhases], async () => {
      const phase = await db.medicationPhases.get(id);
      if (!phase) throw new Error("Phase not found");

      const activePhases = await db.medicationPhases
        .where("prescriptionId")
        .equals(phase.prescriptionId)
        .toArray();

      const currentActive = activePhases.find(p => p.status === "active");
      if (currentActive) {
        await db.medicationPhases.update(currentActive.id, {
          status: "completed",
          endDate: currentActive.endDate ?? now
        });
      }

      await db.medicationPhases.update(id, { status: "active", startDate: now });
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to activate phase", e);
  }
}

export async function startNewPhase(input: CreatePhaseInput): Promise<ServiceResult<MedicationPhase>> {
  try {
    const now = Date.now();

    const result = await db.transaction("rw", [db.medicationPhases, db.phaseSchedules], async () => {
      const isFuture = input.startDate && input.startDate > now;
      const status = isFuture ? "pending" as const : "active" as const;

      if (status === "active") {
        const activePhases = await db.medicationPhases
          .where("prescriptionId")
          .equals(input.prescriptionId)
          .toArray();

        const currentActive = activePhases.find(p => p.status === "active");
        if (currentActive) {
          await db.medicationPhases.update(currentActive.id, {
            status: "completed",
            endDate: currentActive.endDate ?? now
          });
        }
      }

      const phase = buildPhase(input.prescriptionId, {
        ...input,
        startDate: input.startDate || now,
        status,
      }, now);

      await db.medicationPhases.add(phase);

      const schedules = buildSchedules(phase.id, input.schedules, now);
      await db.phaseSchedules.bulkAdd(schedules);

      return phase;
    });

    return ok(result);
  } catch (e) {
    return err("Failed to start new phase", e);
  }
}
