import { db, type Prescription, type MedicationPhase, type InventoryItem, type PhaseSchedule, type PillShape, type FoodInstruction, type CompoundStrength } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { buildAuditEntry } from "@/lib/audit-service";
import { buildPrescription, buildPhase, buildInventory, buildSchedules, buildTransaction } from "@/lib/medication-builders";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";
import { isLive } from "@intake/core/lifecycle";
import { updateSyncedInsideTx, softDeleteInsideTx } from "@/lib/synced-update";

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

    await db.transaction("rw", [db.prescriptions, db.medicationPhases, db.inventoryItems, db.phaseSchedules, db.inventoryTransactions, db.auditLogs, db._syncQueue], async () => {
      await db.prescriptions.add(prescription);
      await enqueueInsideTx("prescriptions", prescription.id, "upsert");

      if (phase) {
        await db.medicationPhases.add(phase);
        await enqueueInsideTx("medicationPhases", phase.id, "upsert");
        for (const s of schedules) {
          await db.phaseSchedules.add(s);
          await enqueueInsideTx("phaseSchedules", s.id, "upsert");
        }
      }

      await db.inventoryItems.add(inventory);
      await enqueueInsideTx("inventoryItems", inventory.id, "upsert");

      if (input.currentStock > 0) {
        const tx = buildTransaction(inventory.id, input.currentStock, "refill", now, "Initial stock");
        await db.inventoryTransactions.add(tx);
        await enqueueInsideTx("inventoryTransactions", tx.id, "upsert");
      }

      const audit = buildAuditEntry("prescription_added", {
        prescriptionId: prescription.id,
        genericName: input.genericName,
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();

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
    await db.transaction("rw", [db.prescriptions, db.auditLogs, db._syncQueue], async () => {
      await updateSyncedInsideTx("prescriptions", id, updates);

      const audit = buildAuditEntry("prescription_updated", {
        prescriptionId: id,
        updatedFields: Object.keys(updates),
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to update prescription", e);
  }
}

export async function deletePrescription(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.transaction("rw", [db.prescriptions, db.medicationPhases, db.phaseSchedules, db.inventoryItems, db.inventoryTransactions, db.doseLogs, db.auditLogs, db._syncQueue], async () => {
      // Everything is tombstoned and enqueued, never hard-deleted: a row that
      // vanishes locally without a queued delete stays live on the server
      // (and in MCP, and on any freshly synced device) forever.
      const doseLogs = await db.doseLogs.where("prescriptionId").equals(id).toArray();
      for (const dl of doseLogs.filter(isLive)) {
        await softDeleteInsideTx("doseLogs", dl, now);
      }

      const inventoryItems = await db.inventoryItems.where("prescriptionId").equals(id).toArray();
      for (const item of inventoryItems) {
        const txns = await db.inventoryTransactions.where("inventoryItemId").equals(item.id).toArray();
        for (const txn of txns.filter(isLive)) {
          await softDeleteInsideTx("inventoryTransactions", txn, now);
        }
        if (isLive(item)) await softDeleteInsideTx("inventoryItems", item, now);
      }

      const phases = await db.medicationPhases.where("prescriptionId").equals(id).toArray();
      for (const p of phases) {
        const schedules = await db.phaseSchedules.where("phaseId").equals(p.id).toArray();
        for (const s of schedules.filter(isLive)) {
          await softDeleteInsideTx("phaseSchedules", s, now);
        }
        if (isLive(p)) await softDeleteInsideTx("medicationPhases", p, now);
      }

      const prescription = await db.prescriptions.get(id);
      if (prescription) await softDeleteInsideTx("prescriptions", prescription, now);

      const audit = buildAuditEntry("prescription_deleted", {
        prescriptionId: id,
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete prescription", e);
  }
}
