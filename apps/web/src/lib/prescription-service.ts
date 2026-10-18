import { db, type Prescription, type MedicationPhase, type InventoryItem, type PhaseSchedule, type PillShape, type FoodInstruction, type CompoundStrength } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { buildPrescription, buildPhase, buildInventory, buildSchedules, buildTransaction } from "@/lib/medication-builders";
import { isLive } from "@intake/core/lifecycle";
import { syncedWrite } from "@/lib/synced-write";

export interface CreatePrescriptionInput {
  // Prescription level
  genericName: string;
  indication: string;
  notes?: string;
  contraindications?: string[];
  warnings?: string[];
  /** Active ingredients for a combination drug (≥ 2). Omit for single-compound. */
  compounds?: CompoundStrength[];

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
  const all = await db.prescriptions.orderBy("createdAt").reverse().toArray();
  return all.filter(isLive);
}

export async function getPrescriptionById(id: string): Promise<Prescription | undefined> {
  return db.prescriptions.get(id);
}

export async function getActivePrescriptions(): Promise<Prescription[]> {
  const all = await db.prescriptions.toArray();
  return all.filter(p => p.isActive === true && isLive(p));
}

export async function getInactivePrescriptions(): Promise<Prescription[]> {
  const all = await db.prescriptions.toArray();
  return all.filter(p => !p.isActive && isLive(p));
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

    await syncedWrite(["prescriptions", "medicationPhases", "inventoryItems", "phaseSchedules", "inventoryTransactions"], async (w) => {
      await w.insert("prescriptions", prescription);

      if (phase) {
        await w.insert("medicationPhases", phase);
        for (const s of schedules) {
          await w.insert("phaseSchedules", s);
        }
      }

      await w.insert("inventoryItems", inventory);

      if (input.currentStock > 0) {
        const tx = buildTransaction(inventory.id, input.currentStock, "initial", now, "Initial stock");
        await w.insert("inventoryTransactions", tx);
      }

      await w.audit("prescription_added", {
        prescriptionId: prescription.id,
        genericName: input.genericName,
      });
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
    await syncedWrite(["prescriptions"], async (w) => {
      await w.patch("prescriptions", id, updates);

      await w.audit("prescription_updated", {
        prescriptionId: id,
        updatedFields: Object.keys(updates),
      });
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to update prescription", e);
  }
}

export async function deletePrescription(id: string): Promise<ServiceResult<void>> {
  try {
    await syncedWrite(["prescriptions", "medicationPhases", "phaseSchedules", "inventoryItems", "inventoryTransactions", "doseLogs"], async (w) => {
      // Everything is tombstoned and enqueued, never hard-deleted: a row that
      // vanishes locally without a queued delete stays live on the server
      // (and in MCP, and on any freshly synced device) forever.
      const doseLogs = await db.doseLogs.where("prescriptionId").equals(id).toArray();
      for (const dl of doseLogs.filter(isLive)) {
        await w.tombstone("doseLogs", dl.id);
      }

      const inventoryItems = await db.inventoryItems.where("prescriptionId").equals(id).toArray();
      for (const item of inventoryItems) {
        const txns = await db.inventoryTransactions.where("inventoryItemId").equals(item.id).toArray();
        for (const txn of txns.filter(isLive)) {
          await w.tombstone("inventoryTransactions", txn.id);
        }
        if (isLive(item)) await w.tombstone("inventoryItems", item.id);
      }

      const phases = await db.medicationPhases.where("prescriptionId").equals(id).toArray();
      for (const p of phases) {
        const schedules = await db.phaseSchedules.where("phaseId").equals(p.id).toArray();
        for (const s of schedules.filter(isLive)) {
          await w.tombstone("phaseSchedules", s.id);
        }
        if (isLive(p)) await w.tombstone("medicationPhases", p.id);
      }

      const prescription = await db.prescriptions.get(id);
      if (prescription) await w.tombstone("prescriptions", prescription.id);

      await w.audit("prescription_deleted", {
        prescriptionId: id,
      });
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete prescription", e);
  }
}
