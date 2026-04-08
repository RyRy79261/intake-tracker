import { db, type Prescription, type MedicationPhase, type InventoryItem, type InventoryTransaction, type PhaseSchedule, type PillShape, type FoodInstruction } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { syncFields } from "./utils";
import { getDeviceTimezone, localHHMMStringToUTCMinutes } from "./timezone";
import { buildAuditEntry } from "./audit-service";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

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
  schedules: { time: string; daysOfWeek: number[]; dosage: number }[];
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
  schedules: { time: string; daysOfWeek: number[]; dosage: number }[];
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
  schedules: { time: string; daysOfWeek: number[]; dosage: number }[];
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
  schedules?: { id?: string; time: string; daysOfWeek: number[]; dosage: number }[];
}

// ---------------------------------------------------------------------------
// Record builders
// ---------------------------------------------------------------------------

function buildPrescription(
  input: CreatePrescriptionInput | { genericName: string; indication: string; notes?: string; contraindications?: string[]; warnings?: string[] },
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

function buildPhase(
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

function buildInventory(
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

function buildSchedules(
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

function buildTransaction(
  inventoryItemId: string,
  amount: number,
  type: "refill" | "consumed" | "adjusted" | "initial",
  now: number,
  note?: string,
): {
  id: string; inventoryItemId: string; timestamp: number; amount: number;
  type: "refill" | "consumed" | "adjusted" | "initial";
  createdAt: number; updatedAt: number; deletedAt: null; deviceId: string; timezone: string;
  note?: string;
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

// ---------------------------------------------------------------------------
// Read functions — return T directly (throw on error)
// ---------------------------------------------------------------------------

export async function getPrescriptions(): Promise<Prescription[]> {
  return db.prescriptions.orderBy("createdAt").reverse().toArray();
}

export async function getPrescriptionById(id: string): Promise<Prescription | undefined> {
  return db.prescriptions.get(id);
}

export async function getActivePrescriptions(): Promise<Prescription[]> {
  const all = await db.prescriptions.toArray();
  return all.filter(p => p.isActive === true);
}

export async function getInactivePrescriptions(): Promise<Prescription[]> {
  const all = await db.prescriptions.toArray();
  return all.filter(p => !p.isActive);
}

export async function getInventoryForPrescription(prescriptionId: string): Promise<InventoryItem[]> {
  return db.inventoryItems.where("prescriptionId").equals(prescriptionId).toArray();
}

export async function getActiveInventoryForPrescription(prescriptionId: string): Promise<InventoryItem | undefined> {
  const items = await db.inventoryItems.where("prescriptionId").equals(prescriptionId).toArray();
  return items.find(i => i.isActive === true);
}

export async function getAllInventoryItems(): Promise<InventoryItem[]> {
  return db.inventoryItems.toArray();
}

export async function getAllActiveInventoryItems(): Promise<InventoryItem[]> {
  const all = await db.inventoryItems.toArray();
  return all.filter(i => i.isActive === true);
}

export async function getActivePhaseForPrescription(prescriptionId: string): Promise<MedicationPhase | undefined> {
  const phases = await db.medicationPhases.where("prescriptionId").equals(prescriptionId).toArray();
  return phases.find(p => p.status === "active");
}

export async function getPhasesForPrescription(prescriptionId: string): Promise<MedicationPhase[]> {
  return db.medicationPhases.where("prescriptionId").equals(prescriptionId).reverse().sortBy("createdAt");
}

export async function getInventoryTransactions(inventoryItemId: string): Promise<InventoryTransaction[]> {
  return db.inventoryTransactions
    .where("inventoryItemId")
    .equals(inventoryItemId)
    .reverse()
    .sortBy("timestamp");
}

// ---------------------------------------------------------------------------
// Mutation functions — keep ServiceResult with audit logging
// ---------------------------------------------------------------------------

export async function addPrescription(input: CreatePrescriptionInput): Promise<ServiceResult<{
  prescription: Prescription;
  phase: MedicationPhase | null;
  inventory: InventoryItem;
  schedules: PhaseSchedule[];
}>> {
  try {
    const now = Date.now();

    const prescription = buildPrescription(input, now);
    const inventory = buildInventory(prescription.id, input, now);

    // PRN / as-needed meds: no phase or schedules when schedule list is empty
    const hasSchedules = input.schedules.length > 0;
    const phase = hasSchedules ? buildPhase(prescription.id, input, now) : null;
    const schedules = phase ? buildSchedules(phase.id, input.schedules, now) : [];

    await db.transaction("rw", [db.prescriptions, db.medicationPhases, db.inventoryItems, db.phaseSchedules, db.inventoryTransactions, db.auditLogs], async () => {
      await db.prescriptions.add(prescription);
      if (phase) {
        await db.medicationPhases.add(phase);
        if (schedules.length > 0) await db.phaseSchedules.bulkAdd(schedules);
      }
      await db.inventoryItems.add(inventory);

      if (input.currentStock > 0) {
        await db.inventoryTransactions.add(buildTransaction(inventory.id, input.currentStock, "refill", now, "Initial stock"));
      }

      await db.auditLogs.add(buildAuditEntry("prescription_added", {
        prescriptionId: prescription.id,
        genericName: input.genericName,
      }));
    });

    return ok({ prescription, phase, inventory, schedules });
  } catch (e) {
    return err("Failed to add prescription", e);
  }
}

export async function addMedicationToPrescription(input: AddMedicationToPrescriptionInput): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    const hasSchedules = input.schedules.length > 0;
    const phase = hasSchedules ? buildPhase(input.prescriptionId, input, now) : null;
    const inventory = buildInventory(input.prescriptionId, input, now);
    const schedules = phase ? buildSchedules(phase.id, input.schedules, now) : [];

    await db.transaction("rw", [db.medicationPhases, db.inventoryItems, db.phaseSchedules, db.inventoryTransactions, db.auditLogs], async () => {
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

      if (phase) {
        await db.medicationPhases.add(phase);
        if (schedules.length > 0) await db.phaseSchedules.bulkAdd(schedules);
      }
      await db.inventoryItems.add(inventory);

      if (input.currentStock > 0) {
        await db.inventoryTransactions.add(buildTransaction(inventory.id, input.currentStock, "refill", now, "Initial stock"));
      }

      await db.auditLogs.add(buildAuditEntry("prescription_updated", {
        prescriptionId: input.prescriptionId,
        action: "medication_added",
        phaseId: phase?.id ?? "none",
        inventoryId: inventory.id,
      }));
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to add medication to prescription", e);
  }
}

export async function updatePrescription(
  id: string,
  updates: Partial<Omit<Prescription, "id" | "createdAt">>,
): Promise<ServiceResult<void>> {
  try {
    await db.transaction("rw", [db.prescriptions, db.auditLogs], async () => {
      await db.prescriptions.update(id, { ...updates, updatedAt: Date.now() });
      await db.auditLogs.add(buildAuditEntry("prescription_updated", {
        prescriptionId: id,
        updatedFields: Object.keys(updates),
      }));
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to update prescription", e);
  }
}

export async function deletePrescription(id: string): Promise<ServiceResult<void>> {
  try {
    await db.transaction("rw", [db.prescriptions, db.medicationPhases, db.phaseSchedules, db.inventoryItems, db.doseLogs, db.auditLogs], async () => {
      await db.doseLogs.where("prescriptionId").equals(id).delete();
      await db.inventoryItems.where("prescriptionId").equals(id).delete();
      const phases = await db.medicationPhases.where("prescriptionId").equals(id).toArray();
      for (const p of phases) {
        await db.phaseSchedules.where("phaseId").equals(p.id).delete();
      }
      await db.medicationPhases.where("prescriptionId").equals(id).delete();
      await db.prescriptions.delete(id);

      await db.auditLogs.add(buildAuditEntry("prescription_deleted", {
        prescriptionId: id,
      }));
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete prescription", e);
  }
}

export async function addInventoryItem(input: Omit<InventoryItem, "id" | "createdAt" | "updatedAt" | "deletedAt" | "deviceId">): Promise<ServiceResult<InventoryItem>> {
  try {
    const item: InventoryItem = {
      ...input,
      id: crypto.randomUUID(),
      ...syncFields(),
    };
    await db.transaction("rw", [db.inventoryItems, db.auditLogs], async () => {
      await db.inventoryItems.add(item);
      await db.auditLogs.add(buildAuditEntry("inventory_added", {
        inventoryItemId: item.id,
        prescriptionId: item.prescriptionId,
        brandName: item.brandName,
        strength: item.strength,
      }));
    });
    return ok(item);
  } catch (e) {
    return err("Failed to add inventory item", e);
  }
}

export async function updateInventoryItem(
  id: string,
  updates: Partial<Omit<InventoryItem, "id" | "createdAt" | "prescriptionId">>,
): Promise<ServiceResult<void>> {
  try {
    await db.transaction("rw", [db.inventoryItems, db.auditLogs], async () => {
      await db.inventoryItems.update(id, { ...updates, updatedAt: Date.now() });
      await db.auditLogs.add(buildAuditEntry("inventory_adjusted", {
        inventoryItemId: id,
        updatedFields: Object.keys(updates),
      }));
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to update inventory item", e);
  }
}

export async function deleteInventoryItem(id: string): Promise<ServiceResult<void>> {
  try {
    await db.transaction("rw", [db.inventoryItems, db.auditLogs], async () => {
      await db.inventoryItems.delete(id);
      await db.auditLogs.add(buildAuditEntry("inventory_deleted", {
        inventoryItemId: id,
      }));
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete inventory item", e);
  }
}

export async function adjustStock(
  inventoryItemId: string,
  delta: number,
  note?: string,
  type?: "refill" | "consumed" | "adjusted",
): Promise<ServiceResult<number>> {
  try {
    const item = await db.inventoryItems.get(inventoryItemId);
    if (!item) return err(`InventoryItem ${inventoryItemId} not found`);
    const currentStock = item.currentStock ?? 0;
    // Negative stock allowed per user decision — no Math.max(0, ...) clamp
    const newStock = Math.round((currentStock + delta) * 10000) / 10000;
    const now = Date.now();

    await db.transaction("rw", [db.inventoryItems, db.inventoryTransactions, db.auditLogs], async () => {
      await db.inventoryItems.update(inventoryItemId, { currentStock: newStock, updatedAt: now });
      await db.inventoryTransactions.add(buildTransaction(
        inventoryItemId,
        delta,
        type ?? (delta > 0 ? "refill" : "consumed"),
        now,
        note,
      ));
      await db.auditLogs.add(buildAuditEntry("inventory_adjusted", {
        inventoryItemId,
        delta,
        newStock,
        ...(note !== undefined && { note }),
      }));
    });

    return ok(newStock);
  } catch (e) {
    return err("Failed to adjust stock", e);
  }
}

export async function updateInventoryTransaction(
  id: string,
  updates: { amount?: number; note?: string },
): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await db.transaction("rw", [db.inventoryTransactions, db.inventoryItems, db.auditLogs], async () => {
      const tx = await db.inventoryTransactions.get(id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      await db.inventoryTransactions.update(id, { ...updates, updatedAt: now });

      // Recalculate currentStock from all non-deleted transactions
      const allTxs = await db.inventoryTransactions
        .where("inventoryItemId")
        .equals(tx.inventoryItemId)
        .toArray();
      const newStock = allTxs
        .filter(t => t.deletedAt === null)
        .reduce((sum, t) => {
          const amount = t.id === id && updates.amount !== undefined ? updates.amount : t.amount;
          return sum + amount;
        }, 0);

      await db.inventoryItems.update(tx.inventoryItemId, {
        currentStock: Math.round(newStock * 10000) / 10000,
        updatedAt: now,
      });

      await db.auditLogs.add(buildAuditEntry("inventory_adjusted", {
        transactionId: id,
        inventoryItemId: tx.inventoryItemId,
        action: "transaction_updated",
        updatedFields: Object.keys(updates),
      }));
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to update inventory transaction", e);
  }
}

export async function deleteInventoryTransaction(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await db.transaction("rw", [db.inventoryTransactions, db.inventoryItems, db.auditLogs], async () => {
      const tx = await db.inventoryTransactions.get(id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      // Soft-delete
      await db.inventoryTransactions.update(id, { deletedAt: now, updatedAt: now });

      // Recalculate currentStock from all non-deleted transactions (excluding this one)
      const allTxs = await db.inventoryTransactions
        .where("inventoryItemId")
        .equals(tx.inventoryItemId)
        .toArray();
      const newStock = allTxs
        .filter(t => t.deletedAt === null && t.id !== id)
        .reduce((sum, t) => sum + t.amount, 0);

      await db.inventoryItems.update(tx.inventoryItemId, {
        currentStock: Math.round(newStock * 10000) / 10000,
        updatedAt: now,
      });

      await db.auditLogs.add(buildAuditEntry("inventory_adjusted", {
        transactionId: id,
        inventoryItemId: tx.inventoryItemId,
        action: "transaction_deleted",
      }));
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to delete inventory transaction", e);
  }
}

export async function activatePhase(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.transaction("rw", [db.medicationPhases, db.auditLogs], async () => {
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
          endDate: currentActive.endDate ?? now,
        });
        await db.auditLogs.add(buildAuditEntry("phase_completed", {
          phaseId: currentActive.id,
          prescriptionId: phase.prescriptionId,
        }));
      }

      await db.medicationPhases.update(id, { status: "active", startDate: now });
      await db.auditLogs.add(buildAuditEntry("phase_activated", {
        phaseId: id,
        prescriptionId: phase.prescriptionId,
      }));
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to activate phase", e);
  }
}

export async function startNewPhase(input: CreatePhaseInput): Promise<ServiceResult<MedicationPhase>> {
  try {
    const now = Date.now();

    const result = await db.transaction("rw", [db.medicationPhases, db.phaseSchedules, db.auditLogs], async () => {
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
            endDate: currentActive.endDate ?? now,
          });
          await db.auditLogs.add(buildAuditEntry("phase_completed", {
            phaseId: currentActive.id,
            prescriptionId: input.prescriptionId,
          }));
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

      await db.auditLogs.add(buildAuditEntry("phase_started", {
        phaseId: phase.id,
        prescriptionId: input.prescriptionId,
        type: input.type,
        status,
      }));

      return phase;
    });

    return ok(result);
  } catch (e) {
    return err("Failed to start new phase", e);
  }
}

export async function updatePhase(input: UpdatePhaseInput): Promise<ServiceResult<void>> {
  try {
    await db.transaction("rw", [db.medicationPhases, db.phaseSchedules, db.auditLogs], async () => {
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
          const tz = getDeviceTimezone();
          await db.phaseSchedules.update(u.id, {
            time: u.time,
            scheduleTimeUTC: localHHMMStringToUTCMinutes(u.time, tz),
            anchorTimezone: tz,
            dosage: u.dosage,
            daysOfWeek: u.daysOfWeek,
            updatedAt: Date.now(),
          });
        }
      }

      await db.auditLogs.add(buildAuditEntry("prescription_updated", {
        phaseId: id,
        action: "phase_updated",
        updatedFields: Object.keys(updates),
        schedulesModified: !!schedules,
      }));
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to update phase", e);
  }
}

export async function deletePhase(id: string): Promise<ServiceResult<void>> {
  try {
    await db.transaction("rw", [db.medicationPhases, db.phaseSchedules, db.auditLogs], async () => {
      await db.phaseSchedules.where("phaseId").equals(id).delete();
      await db.medicationPhases.delete(id);
      await db.auditLogs.add(buildAuditEntry("phase_completed", {
        phaseId: id,
        action: "phase_deleted",
      }));
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete phase", e);
  }
}
