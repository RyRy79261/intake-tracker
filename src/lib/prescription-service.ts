import { db, type Prescription, type MedicationPhase, type InventoryItem, type PhaseSchedule, type PillShape, type FoodInstruction } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { buildAuditEntry } from "./audit-service";
import { buildPrescription, buildPhase, buildInventory, buildSchedules, buildTransaction } from "./medication-builders";

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

// ---------------------------------------------------------------------------
// Reads
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

// ---------------------------------------------------------------------------
// Mutations
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
