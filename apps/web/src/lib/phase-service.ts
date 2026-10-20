import { db, type MedicationPhase, type PhaseSchedule, type PillShape, type FoodInstruction, type CompoundStrength } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { syncFields } from "@/lib/utils";
import { localHHMMStringToUTCMinutes } from "@/lib/timezone";
import { getScheduleAnchorTimezone, homeAnchorOrUndefined } from "@/lib/schedule-anchor";
import { buildPhase, buildInventory, buildSchedules, buildTransaction } from "@/lib/medication-builders";
import { isLive } from "@intake/core/lifecycle";
import { selectEffectivePhase } from "@intake/core/effective-phase";
import { syncedWrite } from "@/lib/synced-write";
import { writeScheduleChange, type ScheduleChangeOutcome } from "@/lib/medication-schedule-service";
import type { ChangeDayRule } from "@intake/core/schedule-window";

export interface AddMedicationToPrescriptionInput {
  prescriptionId: string;
  unit: string;
  brandName: string;
  currentStock: number;
  strength: number;
  pillShape: PillShape;
  pillColor: string;
  visualIdentification?: string;
  refillAlertDays?: number;
  refillAlertPills?: number;
  /** Per-pill combination-drug breakdown; omit for single-compound brands. */
  compounds?: CompoundStrength[];
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
  /**
   * First day the new schedules apply ("YYYY-MM-DD", default today, not
   * before today). Days before it keep the old rows. Ignored for a phase
   * that has not started (pending): its rows are edited in place.
   */
  applyFrom?: string;
  /** Test seam: the change-day rule (default DEFAULT_CHANGE_DAY_RULE). */
  changeDayRule?: ChangeDayRule;
}

export interface UpdatePhaseOutcome {
  /** Set when the schedules changed through "Apply from". */
  scheduleChange?: ScheduleChangeOutcome;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The phase currently driving this prescription's doses: a running
 * plan-linked titration beats maintenance, and tombstones never count.
 */
export async function getActivePhaseForPrescription(prescriptionId: string): Promise<MedicationPhase | undefined> {
  const phases = await db.medicationPhases.where("prescriptionId").equals(prescriptionId).toArray();
  return selectEffectivePhase(phases);
}

export async function getPhasesForPrescription(prescriptionId: string): Promise<MedicationPhase[]> {
  // Dexie's sortBy() materialises and overrides any prior reverse(),
  // so reverse the resulting array instead to get newest-first.
  const phases = await db.medicationPhases.where("prescriptionId").equals(prescriptionId).sortBy("createdAt");
  return phases.filter(isLive).reverse();
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Adds a new medicine (a pill brand) to an existing prescription's stockpile.
 *
 * This is a pure inventory addition. It deliberately does NOT archive the
 * existing brand, touch the schedule/phase, or auto-activate — switching the
 * active brand is a manual action the user takes (via Switch Brand) to mirror
 * which box they're actually filling their pillbox from. The new brand only
 * becomes active when the prescription has no active brand at all, to avoid
 * leaving it with nothing to deduct stock from.
 */
export async function addMedicationToPrescription(input: AddMedicationToPrescriptionInput): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await syncedWrite(["inventoryItems", "inventoryTransactions"], async (w) => {
      const existingInventory = await db.inventoryItems.where("prescriptionId").equals(input.prescriptionId).toArray();
      const hasActiveBrand = existingInventory.some(
        (item) => item.isActive && !item.isArchived && isLive(item),
      );

      const inventory = { ...buildInventory(input.prescriptionId, input, now), isActive: !hasActiveBrand };
      await w.insert("inventoryItems", inventory);

      if (input.currentStock > 0) {
        const transaction = buildTransaction(inventory.id, input.currentStock, "initial", now, "Initial stock");
        await w.insert("inventoryTransactions", transaction);
      }

      await w.audit("prescription_updated", {
        prescriptionId: input.prescriptionId,
        action: "medication_added",
        inventoryId: inventory.id,
        activatedImmediately: !hasActiveBrand,
      });
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to add medication to prescription", e);
  }
}

export async function activatePhase(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await syncedWrite(["medicationPhases"], async (w) => {
      const phase = await db.medicationPhases.get(id);
      if (!phase || !isLive(phase)) throw new Error("Phase not found");

      const activePhases = await db.medicationPhases
        .where("prescriptionId")
        .equals(phase.prescriptionId)
        .toArray();

      const currentActive = activePhases.find(p => p.status === "active" && p.id !== id && isLive(p));
      if (currentActive) {
        await w.patch("medicationPhases", currentActive.id, {
          status: "completed",
          endDate: currentActive.endDate ?? now,
        });
        await w.audit("phase_completed", {
          phaseId: currentActive.id,
          prescriptionId: phase.prescriptionId,
        });
      }

      await w.patch("medicationPhases", id, { status: "active", startDate: now });
      await w.audit("phase_activated", {
        phaseId: id,
        prescriptionId: phase.prescriptionId,
      });
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to activate phase", e);
  }
}

export async function startNewPhase(input: CreatePhaseInput): Promise<ServiceResult<MedicationPhase>> {
  try {
    const now = Date.now();

    const result = await syncedWrite(["medicationPhases", "phaseSchedules"], async (w) => {
      const isFuture = input.startDate && input.startDate > now;
      const status = isFuture ? "pending" as const : "active" as const;

      if (status === "active") {
        const activePhases = await db.medicationPhases
          .where("prescriptionId")
          .equals(input.prescriptionId)
          .toArray();

        const currentActive = activePhases.find(p => p.status === "active" && isLive(p));
        if (currentActive) {
          await w.patch("medicationPhases", currentActive.id, {
            status: "completed",
            endDate: currentActive.endDate ?? now,
          });
          await w.audit("phase_completed", {
            phaseId: currentActive.id,
            prescriptionId: input.prescriptionId,
          });
        }
      }

      const phase = buildPhase(input.prescriptionId, {
        ...input,
        startDate: input.startDate || now,
        status,
      }, now);

      await w.insert("medicationPhases", phase);

      const schedules = buildSchedules(phase.id, input.schedules, now);
      for (const s of schedules) await w.insert("phaseSchedules", s);

      await w.audit("phase_started", {
        phaseId: phase.id,
        prescriptionId: input.prescriptionId,
        type: input.type,
        status,
      });

      return phase;
    });

    return ok(result);
  } catch (e) {
    return err("Failed to start new phase", e);
  }
}

export async function updatePhase(input: UpdatePhaseInput): Promise<ServiceResult<UpdatePhaseOutcome>> {
  try {
    const outcome = await syncedWrite(["medicationPhases", "phaseSchedules", "doseLogs"], async (w) => {
      const { id, schedules, applyFrom, changeDayRule, ...updates } = input;
      const result: UpdatePhaseOutcome = {};
      const phase = await db.medicationPhases.get(id);

      if (Object.keys(updates).length > 0) {
        await w.patch("medicationPhases", id, updates);
      }

      if (schedules && phase && phase.status !== "pending") {
        // A started phase: the change applies from a date, so the days
        // before it keep their time, dose and weekdays.
        result.scheduleChange = await writeScheduleChange(w, id, schedules, {
          ...(applyFrom !== undefined && { applyFrom }),
          ...(changeDayRule !== undefined && { rule: changeDayRule }),
          ...(phase.unit && { closedUnit: phase.unit, unit: updates.unit ?? phase.unit }),
          // The same rows with another date move a pending change to that
          // date (the drawer sends the schedule only when it changed).
          ...(applyFrom !== undefined && { movePending: true }),
        });
      } else if (schedules) {
        // Tombstoned schedules are history: an id pointing at one becomes a
        // new schedule rather than resurrecting the old row.
        const existingSchedules = (await db.phaseSchedules.where("phaseId").equals(id).toArray()).filter(isLive);
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
            const tz = getScheduleAnchorTimezone();
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

        // Removed schedules are soft-deleted: a hard delete leaves nothing for
        // the push to carry, so the server would keep the schedule live.
        const toDelete = existingSchedules.filter(s => !keptIds.has(s.id));
        for (const s of toDelete) {
          await w.tombstone("phaseSchedules", s.id);
        }
        if (toAdd.length > 0) {
          for (const s of toAdd) await w.insert("phaseSchedules", s);
        }
        for (const u of toUpdate) {
          // Re-encode only when the time changed, in the home zone when one
          // is set, else the schedule's own anchor — never the away device's
          // zone (re-anchoring to it is the travel prompt's job).
          const prev = existingSchedules.find((s) => s.id === u.id);
          const anchor =
            homeAnchorOrUndefined() || prev?.anchorTimezone || getScheduleAnchorTimezone();
          const timeFields = prev && prev.time === u.time
            ? {}
            : {
                time: u.time,
                scheduleTimeUTC: localHHMMStringToUTCMinutes(u.time, anchor),
                anchorTimezone: anchor,
              };
          await w.patch("phaseSchedules", u.id, {
            ...timeFields,
            dosage: u.dosage,
            daysOfWeek: u.daysOfWeek,
          });
        }
      }

      await w.audit("prescription_updated", {
        phaseId: id,
        action: "phase_updated",
        updatedFields: Object.keys(updates),
        schedulesModified: !!schedules,
        ...(result.scheduleChange && {
          applyFrom: result.scheduleChange.applyFrom,
          ...(result.scheduleChange.deferredTo && { deferredTo: result.scheduleChange.deferredTo }),
        }),
      });
      return result;
    });
    return ok(outcome);
  } catch (e) {
    // A "Pick ..." refusal is for the user as it is (no technical detail).
    if (e instanceof Error && e.message.startsWith("Pick ")) return err(e.message);
    return err("Failed to update phase", e);
  }
}

export async function deletePhase(id: string): Promise<ServiceResult<void>> {
  try {
    await syncedWrite(["medicationPhases", "phaseSchedules"], async (w) => {
      const schedules = await db.phaseSchedules.where("phaseId").equals(id).toArray();
      for (const s of schedules.filter(isLive)) {
        await w.tombstone("phaseSchedules", s.id);
      }

      const phase = await db.medicationPhases.get(id);
      if (phase) await w.tombstone("medicationPhases", phase.id);

      await w.audit("phase_completed", {
        phaseId: id,
        action: "phase_deleted",
      });
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete phase", e);
  }
}
