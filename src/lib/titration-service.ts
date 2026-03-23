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
  return db.titrationPlans.orderBy("updatedAt").reverse().toArray();
}

export async function getTitrationPlanById(id: string): Promise<TitrationPlan | undefined> {
  return db.titrationPlans.get(id);
}

export async function getActiveTitrationPlans(): Promise<TitrationPlan[]> {
  const all = await db.titrationPlans.toArray();
  return all.filter((p) => p.status === "active");
}

export async function getPhasesForTitrationPlan(planId: string): Promise<MedicationPhase[]> {
  const all = await db.medicationPhases.toArray();
  return all.filter((p) => p.titrationPlanId === planId);
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
    (p) => p.type === "titration" && p.status === "active" && p.titrationPlanId,
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
      [db.titrationPlans, db.medicationPhases, db.phaseSchedules, db.auditLogs],
      async () => {
        await db.titrationPlans.add(plan);
        await db.medicationPhases.bulkAdd(phases);
        await db.phaseSchedules.bulkAdd(schedules);

        await db.auditLogs.add(
          buildAuditEntry("phase_started", {
            titrationPlanId: plan.id,
            title: plan.title,
            prescriptionCount: input.entries.length,
          }),
        );
      },
    );

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
      [db.titrationPlans, db.medicationPhases, db.phaseSchedules, db.auditLogs],
      async () => {
        await db.titrationPlans.update(plan.id, planUpdates);

        // If entries provided, replace all phases and schedules
        if (input.entries) {
          // Delete existing phases and their schedules
          const existingPhases = await db.medicationPhases
            .filter((p) => p.titrationPlanId === plan.id)
            .toArray();

          for (const phase of existingPhases) {
            await db.phaseSchedules.where({ phaseId: phase.id }).delete();
          }
          await db.medicationPhases
            .filter((p) => p.titrationPlanId === plan.id)
            .delete();

          // Create new phases and schedules
          for (const entry of input.entries) {
            const phaseId = crypto.randomUUID();
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

            for (const s of entry.schedules) {
              await db.phaseSchedules.add({
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
        }

        await db.auditLogs.add(
          buildAuditEntry("titration_plan_updated", {
            titrationPlanId: plan.id,
            title: input.title ?? plan.title,
          }),
        );
      },
    );

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
      [db.titrationPlans, db.medicationPhases, db.auditLogs],
      async () => {
        const plan = await db.titrationPlans.get(planId);
        if (!plan) throw new Error("Titration plan not found");

        // Activate the plan
        await db.titrationPlans.update(planId, {
          status: "active",
          updatedAt: now,
        });

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
        }

        await db.auditLogs.add(
          buildAuditEntry("phase_activated", {
            titrationPlanId: planId,
            title: plan.title,
            phasesActivated: titrationPhases.length,
          }),
        );
      },
    );

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
      [db.titrationPlans, db.medicationPhases, db.phaseSchedules, db.auditLogs],
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
            // Delete old maintenance schedules and replace with titration's
            const oldSchedules = await db.phaseSchedules
              .where("phaseId")
              .equals(maintenancePhase.id)
              .toArray();
            await db.phaseSchedules.bulkDelete(oldSchedules.map((s) => s.id));

            // Copy titration schedules to maintenance
            const tz = getDeviceTimezone();
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
              deviceId: syncFields().deviceId,
            }));
            await db.phaseSchedules.bulkAdd(newSchedules);

            // Re-activate maintenance if it was completed
            await db.medicationPhases.update(maintenancePhase.id, {
              status: "active",
              unit: titPhase.unit,
              foodInstruction: titPhase.foodInstruction,
              updatedAt: now,
            });
          }

          // Mark titration phase as completed
          await db.medicationPhases.update(titPhase.id, {
            status: "completed",
            endDate: now,
            updatedAt: now,
          });
        }

        // Mark the plan as completed
        await db.titrationPlans.update(planId, {
          status: "completed",
          updatedAt: now,
        });

        await db.auditLogs.add(
          buildAuditEntry("phase_completed", {
            titrationPlanId: planId,
            title: plan.title,
            action: "titration_completed_and_promoted",
          }),
        );
      },
    );

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
      [db.titrationPlans, db.medicationPhases, db.auditLogs],
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
          }
        }

        await db.titrationPlans.update(planId, {
          status: "cancelled",
          updatedAt: now,
        });

        await db.auditLogs.add(
          buildAuditEntry("phase_completed", {
            titrationPlanId: planId,
            title: plan.title,
            action: "titration_cancelled",
          }),
        );
      },
    );

    return ok(undefined);
  } catch (e) {
    return err("Failed to cancel titration plan", e);
  }
}

export async function deleteTitrationPlan(
  planId: string,
): Promise<ServiceResult<void>> {
  try {
    await db.transaction(
      "rw",
      [db.titrationPlans, db.medicationPhases, db.phaseSchedules, db.auditLogs],
      async () => {
        const allPhases = await db.medicationPhases.toArray();
        const planPhases = allPhases.filter(
          (p) => p.titrationPlanId === planId,
        );

        for (const phase of planPhases) {
          await db.phaseSchedules.where("phaseId").equals(phase.id).delete();
        }
        await db.medicationPhases.bulkDelete(planPhases.map((p) => p.id));
        await db.titrationPlans.delete(planId);

        await db.auditLogs.add(
          buildAuditEntry("phase_completed", {
            titrationPlanId: planId,
            action: "titration_deleted",
          }),
        );
      },
    );

    return ok(undefined);
  } catch (e) {
    return err("Failed to delete titration plan", e);
  }
}
