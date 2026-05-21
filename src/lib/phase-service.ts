import { db, type MedicationPhase, type PhaseSchedule, type PillShape, type FoodInstruction } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { syncFields } from "./utils";
import { getDeviceTimezone, localHHMMStringToUTCMinutes } from "./timezone";
import { buildAuditEntry } from "./audit-service";
import { buildPhase, buildInventory, buildSchedules, buildTransaction } from "./medication-builders";
import { enqueueInsideTx } from "./sync-queue";
import { schedulePush } from "./sync-engine";

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
// Reads
// ---------------------------------------------------------------------------

export async function getActivePhaseForPrescription(prescriptionId: string): Promise<MedicationPhase | undefined> {
  const phases = await db.medicationPhases.where("prescriptionId").equals(prescriptionId).toArray();
  return phases.find(p => p.status === "active");
}

export async function getPhasesForPrescription(prescriptionId: string): Promise<MedicationPhase[]> {
  // Dexie's sortBy() materialises and overrides any prior reverse(),
  // so reverse the resulting array instead to get newest-first.
  const phases = await db.medicationPhases.where("prescriptionId").equals(prescriptionId).sortBy("createdAt");
  return phases.reverse();
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Adds a new medication (inventory + new active phase) to an existing prescription.
 * Straddles prescriptions and inventory — archives the prior active inventory
 * item and completes the previously active phase before adding the new ones.
 */
export async function addMedicationToPrescription(input: AddMedicationToPrescriptionInput): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    const hasSchedules = input.schedules.length > 0;
    const phase = hasSchedules ? buildPhase(input.prescriptionId, input, now) : null;
    const inventory = buildInventory(input.prescriptionId, input, now);
    const schedules = phase ? buildSchedules(phase.id, input.schedules, now) : [];

    await db.transaction("rw", [db.medicationPhases, db.inventoryItems, db.phaseSchedules, db.inventoryTransactions, db.auditLogs, db._syncQueue], async () => {
      const existingInventory = await db.inventoryItems.where("prescriptionId").equals(input.prescriptionId).toArray();
      for (const item of existingInventory) {
        if (item.isActive) {
          await db.inventoryItems.update(item.id, { isActive: false, isArchived: true, updatedAt: now });
          await enqueueInsideTx("inventoryItems", item.id, "upsert");
        }
      }

      const existingPhases = await db.medicationPhases.where("prescriptionId").equals(input.prescriptionId).toArray();
      for (const p of existingPhases) {
        if (p.status === "active") {
          await db.medicationPhases.update(p.id, { status: "completed", endDate: now });
          await enqueueInsideTx("medicationPhases", p.id, "upsert");
        }
      }

      if (phase) {
        await db.medicationPhases.add(phase);
        await enqueueInsideTx("medicationPhases", phase.id, "upsert");
        if (schedules.length > 0) {
          await db.phaseSchedules.bulkAdd(schedules);
          for (const s of schedules) {
            await enqueueInsideTx("phaseSchedules", s.id, "upsert");
          }
        }
      }
      await db.inventoryItems.add(inventory);
      await enqueueInsideTx("inventoryItems", inventory.id, "upsert");

      if (input.currentStock > 0) {
        const transaction = buildTransaction(inventory.id, input.currentStock, "refill", now, "Initial stock");
        await db.inventoryTransactions.add(transaction);
        await enqueueInsideTx("inventoryTransactions", transaction.id, "upsert");
      }

      const audit = buildAuditEntry("prescription_updated", {
        prescriptionId: input.prescriptionId,
        action: "medication_added",
        phaseId: phase?.id ?? "none",
        inventoryId: inventory.id,
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();

    return ok(undefined);
  } catch (e) {
    return err("Failed to add medication to prescription", e);
  }
}

export async function activatePhase(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.transaction("rw", [db.medicationPhases, db.auditLogs, db._syncQueue], async () => {
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
        await enqueueInsideTx("medicationPhases", currentActive.id, "upsert");
        const completedAudit = buildAuditEntry("phase_completed", {
          phaseId: currentActive.id,
          prescriptionId: phase.prescriptionId,
        });
        await db.auditLogs.add(completedAudit);
        await enqueueInsideTx("auditLogs", completedAudit.id, "upsert");
      }

      await db.medicationPhases.update(id, { status: "active", startDate: now });
      await enqueueInsideTx("medicationPhases", id, "upsert");
      const activatedAudit = buildAuditEntry("phase_activated", {
        phaseId: id,
        prescriptionId: phase.prescriptionId,
      });
      await db.auditLogs.add(activatedAudit);
      await enqueueInsideTx("auditLogs", activatedAudit.id, "upsert");
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to activate phase", e);
  }
}

export async function startNewPhase(input: CreatePhaseInput): Promise<ServiceResult<MedicationPhase>> {
  try {
    const now = Date.now();

    const result = await db.transaction("rw", [db.medicationPhases, db.phaseSchedules, db.auditLogs, db._syncQueue], async () => {
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
          await enqueueInsideTx("medicationPhases", currentActive.id, "upsert");
          const completedAudit = buildAuditEntry("phase_completed", {
            phaseId: currentActive.id,
            prescriptionId: input.prescriptionId,
          });
          await db.auditLogs.add(completedAudit);
          await enqueueInsideTx("auditLogs", completedAudit.id, "upsert");
        }
      }

      const phase = buildPhase(input.prescriptionId, {
        ...input,
        startDate: input.startDate || now,
        status,
      }, now);

      await db.medicationPhases.add(phase);
      await enqueueInsideTx("medicationPhases", phase.id, "upsert");

      const schedules = buildSchedules(phase.id, input.schedules, now);
      await db.phaseSchedules.bulkAdd(schedules);
      for (const s of schedules) {
        await enqueueInsideTx("phaseSchedules", s.id, "upsert");
      }

      const startedAudit = buildAuditEntry("phase_started", {
        phaseId: phase.id,
        prescriptionId: input.prescriptionId,
        type: input.type,
        status,
      });
      await db.auditLogs.add(startedAudit);
      await enqueueInsideTx("auditLogs", startedAudit.id, "upsert");

      return phase;
    });
    schedulePush();

    return ok(result);
  } catch (e) {
    return err("Failed to start new phase", e);
  }
}

export async function updatePhase(input: UpdatePhaseInput): Promise<ServiceResult<void>> {
  try {
    await db.transaction("rw", [db.medicationPhases, db.phaseSchedules, db.auditLogs, db._syncQueue], async () => {
      const { id, schedules, ...updates } = input;

      if (Object.keys(updates).length > 0) {
        await db.medicationPhases.update(id, updates);
        await enqueueInsideTx("medicationPhases", id, "upsert");
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

        if (toDelete.length > 0) {
          await db.phaseSchedules.bulkDelete(toDelete);
          for (const sid of toDelete) {
            await enqueueInsideTx("phaseSchedules", sid, "delete");
          }
        }
        if (toAdd.length > 0) {
          await db.phaseSchedules.bulkAdd(toAdd);
          for (const s of toAdd) {
            await enqueueInsideTx("phaseSchedules", s.id, "upsert");
          }
        }
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
          await enqueueInsideTx("phaseSchedules", u.id, "upsert");
        }
      }

      const audit = buildAuditEntry("prescription_updated", {
        phaseId: id,
        action: "phase_updated",
        updatedFields: Object.keys(updates),
        schedulesModified: !!schedules,
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to update phase", e);
  }
}

export async function deletePhase(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.transaction("rw", [db.medicationPhases, db.phaseSchedules, db.auditLogs, db._syncQueue], async () => {
      const schedules = await db.phaseSchedules.where("phaseId").equals(id).toArray();
      for (const s of schedules) {
        await db.phaseSchedules.update(s.id, { deletedAt: now, updatedAt: now });
        await enqueueInsideTx("phaseSchedules", s.id, "delete");
      }

      await db.medicationPhases.update(id, { deletedAt: now, updatedAt: now });
      await enqueueInsideTx("medicationPhases", id, "delete");

      const audit = buildAuditEntry("phase_completed", {
        phaseId: id,
        action: "phase_deleted",
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete phase", e);
  }
}
