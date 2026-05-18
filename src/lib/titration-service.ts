import {
  db,
  type TitrationPlan,
  type TitrationPlanStatus,
  type MedicationPhase,
  type PhaseSchedule,
} from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { syncFields } from "./utils";
import { getDeviceTimezone, localHHMMStringToUTCMinutes } from "./timezone";
import { buildAuditEntry } from "./audit-service";
import { enqueueInsideTx } from "./sync-queue";
import { schedulePush } from "./sync-engine";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateTitrationPlanInput {
  title: string;
  conditionLabel: string;
  recommendedStartDate?: number;
  startImmediately?: boolean;
  notes?: string;
  warnings?: string[];
  entries: TitrationEntryInput[];
}

export interface TitrationEntryInput {
  prescriptionId: string;
  schedules: { time: string; daysOfWeek: number[]; dosage: number }[];
  unit: string;
  foodInstruction?: "before" | "after" | "none";
}

// ---------------------------------------------------------------------------
// Read functions
// ---------------------------------------------------------------------------

export async function getTitrationPlans(): Promise<TitrationPlan[]> {
  const all = await db.titrationPlans.orderBy("updatedAt").reverse().toArray();
  return all.filter(p => p.deletedAt === null);
}

export async function getTitrationPlanById(id: string): Promise<TitrationPlan | undefined> {
  return db.titrationPlans.get(id);
}

export async function getActiveTitrationPlans(): Promise<TitrationPlan[]> {
  const all = await db.titrationPlans.toArray();
  return all.filter((p) => p.status === "active" && p.deletedAt === null);
}

export async function getPhasesForTitrationPlan(planId: string): Promise<MedicationPhase[]> {
  const all = await db.medicationPhases.toArray();
  return all.filter((p) => p.titrationPlanId === planId && p.deletedAt === null);
}

export async function getConditionLabels(): Promise<string[]> {
  const plans = await db.titrationPlans.toArray();
  const prescriptions = await db.prescriptions.toArray();

  const labels = new Set<string>();
  for (const p of plans) {
    if (p.conditionLabel) labels.add(p.conditionLabel);
  }
  for (const rx of prescriptions) {
    if (rx.indication) labels.add(rx.indication);
  }
  return Array.from(labels).sort();
}

/**
 * Check if a prescription has an active titration phase override.
 * Returns the titration phase if one exists, undefined otherwise.
 */
export async function getActiveTitrationPhaseForPrescription(
  prescriptionId: string,
): Promise<MedicationPhase | undefined> {
  const phases = await db.medicationPhases
    .where("prescriptionId")
    .equals(prescriptionId)
    .toArray();
  return phases.find(
    (p) => p.type === "titration" && p.status === "active" && p.titrationPlanId && p.deletedAt === null,
  );
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createTitrationPlan(
  input: CreateTitrationPlanInput,
): Promise<ServiceResult<TitrationPlan>> {
  try {
    const now = Date.now();
    const sf = syncFields();
    const tz = getDeviceTimezone();

    const plan: TitrationPlan = {
      id: crypto.randomUUID(),
      title: input.title,
      conditionLabel: input.conditionLabel,
      ...(input.recommendedStartDate !== undefined && {
        recommendedStartDate: input.recommendedStartDate,
      }),
      status: input.startImmediately ? "active" : "draft",
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.warnings !== undefined && { warnings: input.warnings }),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: sf.deviceId,
    };

    const phases: MedicationPhase[] = [];
    const schedules: PhaseSchedule[] = [];

    for (const entry of input.entries) {
      const phaseId = crypto.randomUUID();
      phases.push({
        id: phaseId,
        prescriptionId: entry.prescriptionId,
        type: "titration",
        unit: entry.unit,
        startDate: input.startImmediately ? now : (input.recommendedStartDate ?? now),
        foodInstruction: entry.foodInstruction ?? "none",
        status: input.startImmediately ? "active" : "pending",
        titrationPlanId: plan.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deviceId: sf.deviceId,
      });

      for (const s of entry.schedules) {
        schedules.push({
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
        });
      }
    }

    await db.transaction(
      "rw",
      [db.titrationPlans, db.medicationPhases, db.phaseSchedules, db.auditLogs, db._syncQueue],
      async () => {
        await db.titrationPlans.add(plan);
        await enqueueInsideTx("titrationPlans", plan.id, "upsert");
        await db.medicationPhases.bulkAdd(phases);
        for (const p of phases) {
          await enqueueInsideTx("medicationPhases", p.id, "upsert");
        }
        await db.phaseSchedules.bulkAdd(schedules);
        for (const s of schedules) {
          await enqueueInsideTx("phaseSchedules", s.id, "upsert");
        }

        const auditEntry = buildAuditEntry("phase_started", {
          titrationPlanId: plan.id,
          title: plan.title,
          prescriptionCount: input.entries.length,
        });
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");
      },
    );
    schedulePush();

    return ok(plan);
  } catch (e) {
    return err("Failed to create titration plan", e);
  }
}

export interface UpdateTitrationPlanInput {
  planId: string;
  title?: string;
  conditionLabel?: string;
  recommendedStartDate?: number;
  notes?: string;
  warnings?: string[];
  entries?: TitrationEntryInput[];
}

export async function updateTitrationPlan(
  input: UpdateTitrationPlanInput,
): Promise<ServiceResult<TitrationPlan>> {
  try {
    const plan = await db.titrationPlans.get(input.planId);
    if (!plan) return err("Titration plan not found");

    const now = Date.now();
    const sf = syncFields();
    const tz = getDeviceTimezone();

    // Update plan metadata
    const planUpdates: Partial<TitrationPlan> = { updatedAt: now };
    if (input.title !== undefined) planUpdates.title = input.title;
    if (input.conditionLabel !== undefined) planUpdates.conditionLabel = input.conditionLabel;
    if (input.recommendedStartDate !== undefined) planUpdates.recommendedStartDate = input.recommendedStartDate;
    if (input.notes !== undefined) planUpdates.notes = input.notes;
    if (input.warnings !== undefined) planUpdates.warnings = input.warnings;

    await db.transaction(
      "rw",
      [db.titrationPlans, db.medicationPhases, db.phaseSchedules, db.doseLogs, db.auditLogs, db._syncQueue],
      async () => {
        await db.titrationPlans.update(plan.id, planUpdates);
        await enqueueInsideTx("titrationPlans", plan.id, "upsert");

        // If entries provided, replace all phases and schedules
        if (input.entries) {
          // Collect existing phases (to remap dose logs)
          const existingPhases = await db.medicationPhases
            .where("titrationPlanId")
            .equals(plan.id)
            .toArray();

          // Build old phaseId → prescriptionId map for dose log remapping
          const oldPhaseToRx = new Map<string, string>();
          for (const phase of existingPhases) {
            oldPhaseToRx.set(phase.id, phase.prescriptionId);
          }

          // Soft-delete existing schedules and phases
          for (const phase of existingPhases) {
            const scheds = await db.phaseSchedules.where({ phaseId: phase.id }).toArray();
            for (const s of scheds) {
              await db.phaseSchedules.update(s.id, { deletedAt: now, updatedAt: now });
              await enqueueInsideTx("phaseSchedules", s.id, "upsert");
            }
          }
          for (const phase of existingPhases) {
            await db.medicationPhases.update(phase.id, { deletedAt: now, updatedAt: now });
            await enqueueInsideTx("medicationPhases", phase.id, "upsert");
          }

          // Create new phases and schedules, tracking rx → new phaseId mapping
          const rxToNewPhase = new Map<string, string>();
          for (const entry of input.entries) {
            const phaseId = crypto.randomUUID();
            rxToNewPhase.set(entry.prescriptionId, phaseId);

            await db.medicationPhases.add({
              id: phaseId,
              prescriptionId: entry.prescriptionId,
              type: "titration",
              unit: entry.unit,
              startDate: plan.recommendedStartDate ?? now,
              foodInstruction: entry.foodInstruction ?? "none",
              status: plan.status === "active" ? "active" : "pending",
              titrationPlanId: plan.id,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              deviceId: sf.deviceId,
            });
            await enqueueInsideTx("medicationPhases", phaseId, "upsert");

            for (const s of entry.schedules) {
              const schedId = crypto.randomUUID();
              await db.phaseSchedules.add({
                id: schedId,
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
              });
              await enqueueInsideTx("phaseSchedules", schedId, "upsert");
            }
          }

          // Remap existing dose logs from old phase IDs to new ones (by prescriptionId)
          const remapEntries = Array.from(oldPhaseToRx.entries());
          for (let i = 0; i < remapEntries.length; i++) {
            const entry = remapEntries[i]!;
            const oldPhaseId = entry[0];
            const rxId = entry[1];
            const newPhaseId = rxToNewPhase.get(rxId);
            if (newPhaseId) {
              const logsToRemap = await db.doseLogs
                .where("phaseId")
                .equals(oldPhaseId)
                .toArray();
              for (const dl of logsToRemap) {
                await db.doseLogs.update(dl.id, { phaseId: newPhaseId, updatedAt: now });
                await enqueueInsideTx("doseLogs", dl.id, "upsert");
              }
            }
          }
        }

        const auditEntry = buildAuditEntry("titration_plan_updated", {
          titrationPlanId: plan.id,
          title: input.title ?? plan.title,
        });
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");
      },
    );
    schedulePush();

    const updated = await db.titrationPlans.get(plan.id);
    return ok(updated!);
  } catch (e) {
    return err("Failed to update titration plan", e);
  }
}

export async function activateTitrationPlan(
  planId: string,
): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await db.transaction(
      "rw",
      [db.titrationPlans, db.medicationPhases, db.auditLogs, db._syncQueue],
      async () => {
        const plan = await db.titrationPlans.get(planId);
        if (!plan) throw new Error("Titration plan not found");

        // Activate the plan
        await db.titrationPlans.update(planId, {
          status: "active",
          updatedAt: now,
        });
        await enqueueInsideTx("titrationPlans", planId, "upsert");

        // Activate all pending phases for this plan
        const planPhases = await db.medicationPhases.toArray();
        const titrationPhases = planPhases.filter(
          (p) => p.titrationPlanId === planId && p.status === "pending",
        );

        for (const phase of titrationPhases) {
          await db.medicationPhases.update(phase.id, {
            status: "active",
            startDate: now,
            updatedAt: now,
          });
          await enqueueInsideTx("medicationPhases", phase.id, "upsert");
        }

        const auditEntry = buildAuditEntry("phase_activated", {
          titrationPlanId: planId,
          title: plan.title,
          phasesActivated: titrationPhases.length,
        });
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");
      },
    );
    schedulePush();

    return ok(undefined);
  } catch (e) {
    return err("Failed to activate titration plan", e);
  }
}

export async function completeTitrationPlan(
  planId: string,
): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await db.transaction(
      "rw",
      [db.titrationPlans, db.medicationPhases, db.phaseSchedules, db.auditLogs, db._syncQueue],
      async () => {
        const plan = await db.titrationPlans.get(planId);
        if (!plan) throw new Error("Titration plan not found");

        // Get all titration phases for this plan
        const allPhases = await db.medicationPhases.toArray();
        const titrationPhases = allPhases.filter(
          (p) => p.titrationPlanId === planId && p.type === "titration",
        );

        for (const titPhase of titrationPhases) {
          // Get titration schedules
          const titSchedules = await db.phaseSchedules
            .where("phaseId")
            .equals(titPhase.id)
            .toArray();

          // Find the maintenance phase for this prescription
          const maintenancePhases = allPhases.filter(
            (p) =>
              p.prescriptionId === titPhase.prescriptionId &&
              p.type === "maintenance" &&
              (p.status === "active" || p.status === "completed"),
          );
          const maintenancePhase = maintenancePhases.find(
            (p) => p.status === "active",
          ) ?? maintenancePhases[0];

          if (maintenancePhase) {
            // Soft-delete old maintenance schedules and replace with titration's
            const oldSchedules = await db.phaseSchedules
              .where("phaseId")
              .equals(maintenancePhase.id)
              .toArray();
            for (const os of oldSchedules) {
              await db.phaseSchedules.update(os.id, { deletedAt: now, updatedAt: now });
              await enqueueInsideTx("phaseSchedules", os.id, "upsert");
            }

            // Copy titration schedules to maintenance
            const tz = getDeviceTimezone();
            const sf = syncFields();
            const newSchedules: PhaseSchedule[] = titSchedules.map((s) => ({
              id: crypto.randomUUID(),
              phaseId: maintenancePhase.id,
              time: s.time,
              scheduleTimeUTC: s.scheduleTimeUTC,
              anchorTimezone: tz,
              dosage: s.dosage,
              daysOfWeek: s.daysOfWeek,
              enabled: true,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              deviceId: sf.deviceId,
            }));
            await db.phaseSchedules.bulkAdd(newSchedules);
            for (const ns of newSchedules) {
              await enqueueInsideTx("phaseSchedules", ns.id, "upsert");
            }

            // Re-activate maintenance if it was completed
            await db.medicationPhases.update(maintenancePhase.id, {
              status: "active",
              unit: titPhase.unit,
              foodInstruction: titPhase.foodInstruction,
              updatedAt: now,
            });
            await enqueueInsideTx("medicationPhases", maintenancePhase.id, "upsert");
          }

          // Mark titration phase as completed
          await db.medicationPhases.update(titPhase.id, {
            status: "completed",
            endDate: now,
            updatedAt: now,
          });
          await enqueueInsideTx("medicationPhases", titPhase.id, "upsert");
        }

        // Mark the plan as completed
        await db.titrationPlans.update(planId, {
          status: "completed",
          updatedAt: now,
        });
        await enqueueInsideTx("titrationPlans", planId, "upsert");

        const auditEntry = buildAuditEntry("phase_completed", {
          titrationPlanId: planId,
          title: plan.title,
          action: "titration_completed_and_promoted",
        });
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");
      },
    );
    schedulePush();

    return ok(undefined);
  } catch (e) {
    return err("Failed to complete titration plan", e);
  }
}

export async function cancelTitrationPlan(
  planId: string,
): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await db.transaction(
      "rw",
      [db.titrationPlans, db.medicationPhases, db.auditLogs, db._syncQueue],
      async () => {
        const plan = await db.titrationPlans.get(planId);
        if (!plan) throw new Error("Titration plan not found");

        // Cancel all phases for this plan
        const allPhases = await db.medicationPhases.toArray();
        const planPhases = allPhases.filter(
          (p) => p.titrationPlanId === planId,
        );

        for (const phase of planPhases) {
          if (phase.status === "active" || phase.status === "pending") {
            await db.medicationPhases.update(phase.id, {
              status: "cancelled",
              endDate: now,
              updatedAt: now,
            });
            await enqueueInsideTx("medicationPhases", phase.id, "upsert");
          }
        }

        // Re-activate maintenance phases for affected prescriptions
        const affectedRxIds = Array.from(
          new Set(planPhases.map((p) => p.prescriptionId)),
        );
        for (const rxId of affectedRxIds) {
          const rxPhases = allPhases.filter(
            (p) =>
              p.prescriptionId === rxId &&
              p.type === "maintenance" &&
              p.status === "completed",
          );
          // Re-activate the most recently completed maintenance phase
          const latest = rxPhases.sort(
            (a, b) => b.updatedAt - a.updatedAt,
          )[0];
          if (latest) {
            await db.medicationPhases.update(latest.id, {
              status: "active",
              updatedAt: now,
            });
            await enqueueInsideTx("medicationPhases", latest.id, "upsert");
          }
        }

        await db.titrationPlans.update(planId, {
          status: "cancelled",
          updatedAt: now,
        });
        await enqueueInsideTx("titrationPlans", planId, "upsert");

        const auditEntry = buildAuditEntry("phase_completed", {
          titrationPlanId: planId,
          title: plan.title,
          action: "titration_cancelled",
        });
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");
      },
    );
    schedulePush();

    return ok(undefined);
  } catch (e) {
    return err("Failed to cancel titration plan", e);
  }
}

export async function deleteTitrationPlan(
  planId: string,
): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.transaction(
      "rw",
      [db.titrationPlans, db.medicationPhases, db.phaseSchedules, db.auditLogs, db._syncQueue],
      async () => {
        const allPhases = await db.medicationPhases.toArray();
        const planPhases = allPhases.filter(
          (p) => p.titrationPlanId === planId,
        );

        for (const phase of planPhases) {
          const scheds = await db.phaseSchedules.where("phaseId").equals(phase.id).toArray();
          for (const s of scheds) {
            await db.phaseSchedules.update(s.id, { deletedAt: now, updatedAt: now });
            await enqueueInsideTx("phaseSchedules", s.id, "upsert");
          }
        }
        for (const phase of planPhases) {
          await db.medicationPhases.update(phase.id, { deletedAt: now, updatedAt: now });
          await enqueueInsideTx("medicationPhases", phase.id, "upsert");
        }
        await db.titrationPlans.update(planId, { deletedAt: now, updatedAt: now });
        await enqueueInsideTx("titrationPlans", planId, "upsert");

        const auditEntry = buildAuditEntry("phase_completed", {
          titrationPlanId: planId,
          action: "titration_deleted",
        });
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");
      },
    );
    schedulePush();

    return ok(undefined);
  } catch (e) {
    return err("Failed to delete titration plan", e);
  }
}
