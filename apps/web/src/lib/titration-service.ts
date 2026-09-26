import {
  db,
  type TitrationPlan,
  type MedicationPhase,
  type PhaseSchedule,
} from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { baseSyncFields } from "@/lib/utils";
import { getDeviceTimezone, localHHMMStringToUTCMinutes } from "@/lib/timezone";
import { buildAuditEntry } from "@/lib/audit-service";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";
import { isLive } from "@intake/core/lifecycle";
import { toLocalDateKey } from "@/lib/date-utils";
import { updateSyncedInsideTx, softDeleteInsideTx } from "@/lib/synced-update";

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
  schedules: TitrationScheduleInput[];
  /**
   * Dose unit. Omit to inherit the prescription's current (maintenance)
   * unit, so a mcg or ml medication is never relabelled as mg.
   */
  unit?: string;
  foodInstruction?: "before" | "after" | "none";
}

export interface TitrationScheduleInput {
  time: string;
  daysOfWeek: number[];
  dosage: number;
}

// ---------------------------------------------------------------------------
// Read functions
// ---------------------------------------------------------------------------

export async function getTitrationPlans(): Promise<TitrationPlan[]> {
  const all = await db.titrationPlans.orderBy("updatedAt").reverse().toArray();
  return all.filter(isLive);
}

export async function getTitrationPlanById(id: string): Promise<TitrationPlan | undefined> {
  return db.titrationPlans.get(id);
}

export async function getActiveTitrationPlans(): Promise<TitrationPlan[]> {
  const all = await db.titrationPlans.toArray();
  return all.filter((p) => p.status === "active" && isLive(p));
}

/**
 * Whether a planned titration step is due to start: a live draft whose
 * recommended start date falls on or before `todayKey` (local YYYY-MM-DD).
 *
 * A due step is NOT started automatically. The app asks the user to confirm
 * it (activateTitrationPlan); until then the previous regimen stays in effect.
 */
export function isTitrationPlanDue(
  plan: Pick<TitrationPlan, "status" | "recommendedStartDate" | "deletedAt">,
  todayKey: string,
): boolean {
  return (
    isLive(plan) &&
    plan.status === "draft" &&
    plan.recommendedStartDate != null &&
    toLocalDateKey(plan.recommendedStartDate) <= todayKey
  );
}

/**
 * Draft plans whose start date has arrived, oldest planned start first. A plan
 * is only offered while it still has a live pending phase on a live
 * prescription: once its medication is deleted there is nothing to start.
 */
export async function getDueTitrationPlans(todayKey: string): Promise<TitrationPlan[]> {
  const all = await db.titrationPlans.toArray();
  const due = all.filter((p) => isTitrationPlanDue(p, todayKey));
  if (due.length === 0) return [];
  const liveRx = new Set(
    (await db.prescriptions.toArray()).filter(isLive).map((rx) => rx.id),
  );
  const startable = new Set(
    (await db.medicationPhases.where("titrationPlanId").anyOf(due.map((p) => p.id)).toArray())
      .filter((ph) => isLive(ph) && ph.status === "pending" && liveRx.has(ph.prescriptionId))
      .map((ph) => ph.titrationPlanId),
  );
  return due
    .filter((p) => startable.has(p.id))
    .sort((a, b) => (a.recommendedStartDate ?? 0) - (b.recommendedStartDate ?? 0));
}

export async function getPhasesForTitrationPlan(planId: string): Promise<MedicationPhase[]> {
  const all = await db.medicationPhases.where("titrationPlanId").equals(planId).toArray();
  return all.filter(isLive);
}

export async function getConditionLabels(): Promise<string[]> {
  const plans = (await db.titrationPlans.toArray()).filter(isLive);
  const prescriptions = (await db.prescriptions.toArray()).filter(isLive);

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
    (p) => p.type === "titration" && p.status === "active" && p.titrationPlanId && isLive(p),
  );
}


// ---------------------------------------------------------------------------
// Regimen helpers
// ---------------------------------------------------------------------------

/**
 * The prescription's baseline phase: its live maintenance phase, preferring
 * the running one, else the most recently touched completed one.
 */
function pickMaintenancePhase(rxPhases: readonly MedicationPhase[]): MedicationPhase | undefined {
  const maintenance = rxPhases.filter((p) => p.type === "maintenance" && isLive(p));
  return (
    maintenance.find((p) => p.status === "active") ??
    maintenance
      .filter((p) => p.status === "completed")
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  );
}

/**
 * The unit a titration entry is dosed in: the caller's explicit unit, else
 * the prescription's maintenance unit, else whatever a previous titration
 * phase used. "mg" is only the last resort for a prescription with no phase.
 */
function resolveEntryUnit(entry: TitrationEntryInput, rxPhases: readonly MedicationPhase[]): string {
  if (entry.unit) return entry.unit;
  const live = rxPhases.filter(isLive);
  return (
    pickMaintenancePhase(live)?.unit ??
    live.find((p) => p.type === "titration")?.unit ??
    "mg"
  );
}

async function livePhasesForRxInsideTx(prescriptionId: string): Promise<MedicationPhase[]> {
  const phases = await db.medicationPhases.where("prescriptionId").equals(prescriptionId).toArray();
  return phases.filter(isLive);
}

async function liveSchedulesForPhaseInsideTx(phaseId: string): Promise<PhaseSchedule[]> {
  const schedules = await db.phaseSchedules.where("phaseId").equals(phaseId).toArray();
  return schedules.filter(isLive);
}

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((d, i) => d === sb[i]);
}

function newSchedule(
  phaseId: string,
  input: TitrationScheduleInput,
  tz: string,
  deviceId: string,
  now: number,
): PhaseSchedule {
  return {
    id: crypto.randomUUID(),
    phaseId,
    time: input.time,
    scheduleTimeUTC: localHHMMStringToUTCMinutes(input.time, tz),
    anchorTimezone: tz,
    dosage: input.dosage,
    daysOfWeek: input.daysOfWeek,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId,
  };
}

/**
 * Make a phase's live schedules match `inputs`, keeping ids wherever
 * possible. Dose logs key on scheduleId, so replacing an unchanged schedule
 * with a fresh row would un-take every dose already logged against it.
 *
 * Identical schedules are left untouched; the remaining ones are paired by
 * time order and updated in place; only a surplus is added or soft-deleted.
 */
async function reconcileSchedulesInsideTx(
  phaseId: string,
  inputs: readonly TitrationScheduleInput[],
  ctx: { now: number; tz: string; deviceId: string },
): Promise<void> {
  const unmatchedExisting = await liveSchedulesForPhaseInsideTx(phaseId);
  const unmatchedInputs: TitrationScheduleInput[] = [];

  for (const input of inputs) {
    const idx = unmatchedExisting.findIndex(
      (s) =>
        s.enabled === true &&
        s.time === input.time &&
        s.dosage === input.dosage &&
        sameDays(s.daysOfWeek, input.daysOfWeek),
    );
    if (idx >= 0) unmatchedExisting.splice(idx, 1);
    else unmatchedInputs.push(input);
  }

  unmatchedExisting.sort((a, b) => a.time.localeCompare(b.time));
  unmatchedInputs.sort((a, b) => a.time.localeCompare(b.time));

  const pairs = Math.min(unmatchedExisting.length, unmatchedInputs.length);
  for (let i = 0; i < pairs; i++) {
    const existing = unmatchedExisting[i]!;
    const input = unmatchedInputs[i]!;
    await updateSyncedInsideTx(
      "phaseSchedules",
      existing.id,
      {
        dosage: input.dosage,
        daysOfWeek: input.daysOfWeek,
        enabled: true,
        ...(input.time !== existing.time && {
          time: input.time,
          scheduleTimeUTC: localHHMMStringToUTCMinutes(input.time, ctx.tz),
          anchorTimezone: ctx.tz,
        }),
      },
      { now: ctx.now },
    );
  }
  for (const input of unmatchedInputs.slice(pairs)) {
    const schedule = newSchedule(phaseId, input, ctx.tz, ctx.deviceId, ctx.now);
    await db.phaseSchedules.add(schedule);
    await enqueueInsideTx("phaseSchedules", schedule.id, "upsert");
  }
  for (const stale of unmatchedExisting.slice(pairs)) {
    await softDeleteInsideTx("phaseSchedules", stale, ctx.now);
  }
}

/** Tombstone a phase and its schedules; running/pending phases become cancelled. */
async function retirePhaseInsideTx(phase: MedicationPhase, now: number): Promise<void> {
  for (const s of await liveSchedulesForPhaseInsideTx(phase.id)) {
    await softDeleteInsideTx("phaseSchedules", s, now);
  }
  await softDeleteInsideTx("medicationPhases", phase, now);
}

/**
 * After a running titration stops without being promoted, put each
 * prescription back on its maintenance dose — but only when no maintenance
 * phase is already running for it.
 */
async function restoreMaintenanceInsideTx(prescriptionIds: Iterable<string>, now: number): Promise<void> {
  for (const rxId of new Set(prescriptionIds)) {
    const rxPhases = await livePhasesForRxInsideTx(rxId);
    const latest = pickMaintenancePhase(rxPhases);
    if (latest && latest.status !== "active") {
      await updateSyncedInsideTx("medicationPhases", latest.id, { status: "active" }, { now });
    }
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createTitrationPlan(
  input: CreateTitrationPlanInput,
): Promise<ServiceResult<TitrationPlan>> {
  try {
    const now = Date.now();
    const sf = baseSyncFields();
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

    await db.transaction(
      "rw",
      [db.titrationPlans, db.medicationPhases, db.phaseSchedules, db.auditLogs, db._syncQueue],
      async () => {
        const phases: MedicationPhase[] = [];
        const schedules: PhaseSchedule[] = [];

        for (const entry of input.entries) {
          const rxPhases = await livePhasesForRxInsideTx(entry.prescriptionId);
          const phaseId = crypto.randomUUID();
          phases.push({
            id: phaseId,
            prescriptionId: entry.prescriptionId,
            type: "titration",
            unit: resolveEntryUnit(entry, rxPhases),
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
            schedules.push(newSchedule(phaseId, s, tz, sf.deviceId, now));
          }
        }

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

/**
 * Edit a plan in place. Each prescription keeps its titration phase and, as
 * far as possible, its schedule ids, so dose logs already recorded against
 * them stay matched (a replaced id would show taken doses as pending and
 * invite a second, stock-decrementing "take"). Only entries that actually
 * changed are written. A prescription dropped from the plan has its phase
 * cancelled and tombstoned.
 */
export async function updateTitrationPlan(
  input: UpdateTitrationPlanInput,
): Promise<ServiceResult<TitrationPlan>> {
  try {
    const plan = await db.titrationPlans.get(input.planId);
    if (!plan) return err("Titration plan not found");

    const now = Date.now();
    const sf = baseSyncFields();
    const tz = getDeviceTimezone();

    const planUpdates: Partial<Omit<TitrationPlan, "id" | "updatedAt">> = {};
    if (input.title !== undefined) planUpdates.title = input.title;
    if (input.conditionLabel !== undefined) planUpdates.conditionLabel = input.conditionLabel;
    if (input.recommendedStartDate !== undefined) planUpdates.recommendedStartDate = input.recommendedStartDate;
    if (input.notes !== undefined) planUpdates.notes = input.notes;
    if (input.warnings !== undefined) planUpdates.warnings = input.warnings;

    await db.transaction(
      "rw",
      [db.titrationPlans, db.medicationPhases, db.phaseSchedules, db.auditLogs, db._syncQueue],
      async () => {
        await updateSyncedInsideTx("titrationPlans", plan.id, planUpdates, { now });

        if (input.entries) {
          const planPhases = (await db.medicationPhases
            .where("titrationPlanId")
            .equals(plan.id)
            .toArray()).filter(isLive);

          // One phase per prescription; any extra live duplicates (left by
          // older clients' replace-on-edit) are retired below.
          const phaseByRx = new Map<string, MedicationPhase>();
          const surplus: MedicationPhase[] = [];
          for (const phase of planPhases) {
            if (phaseByRx.has(phase.prescriptionId)) surplus.push(phase);
            else phaseByRx.set(phase.prescriptionId, phase);
          }

          const keptRx = new Set<string>();
          for (const entry of input.entries) {
            keptRx.add(entry.prescriptionId);
            const rxPhases = await livePhasesForRxInsideTx(entry.prescriptionId);
            const unit = resolveEntryUnit(entry, rxPhases);
            const existing = phaseByRx.get(entry.prescriptionId);

            if (existing) {
              const changes: Partial<Omit<MedicationPhase, "id" | "updatedAt">> = {};
              if (existing.unit !== unit) changes.unit = unit;
              if (entry.foodInstruction !== undefined && entry.foodInstruction !== existing.foodInstruction) {
                changes.foodInstruction = entry.foodInstruction;
              }
              if (
                existing.status === "pending" &&
                input.recommendedStartDate !== undefined &&
                existing.startDate !== input.recommendedStartDate
              ) {
                changes.startDate = input.recommendedStartDate;
              }
              if (Object.keys(changes).length > 0) {
                await updateSyncedInsideTx("medicationPhases", existing.id, changes, { now });
              }
              await reconcileSchedulesInsideTx(existing.id, entry.schedules, { now, tz, deviceId: sf.deviceId });
              continue;
            }

            const running = plan.status === "active";
            const phase: MedicationPhase = {
              id: crypto.randomUUID(),
              prescriptionId: entry.prescriptionId,
              type: "titration",
              unit,
              startDate: running ? now : (input.recommendedStartDate ?? plan.recommendedStartDate ?? now),
              foodInstruction: entry.foodInstruction ?? "none",
              status: running ? "active" : "pending",
              titrationPlanId: plan.id,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              deviceId: sf.deviceId,
            };
            await db.medicationPhases.add(phase);
            await enqueueInsideTx("medicationPhases", phase.id, "upsert");
            for (const s of entry.schedules) {
              const schedule = newSchedule(phase.id, s, tz, sf.deviceId, now);
              await db.phaseSchedules.add(schedule);
              await enqueueInsideTx("phaseSchedules", schedule.id, "upsert");
            }
          }

          const removed = [
            ...planPhases.filter((p) => !keptRx.has(p.prescriptionId)),
            ...surplus,
          ];
          for (const phase of removed) {
            await retirePhaseInsideTx(phase, now);
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

        await updateSyncedInsideTx("titrationPlans", planId, { status: "active" }, { now });

        // Activate the plan's live pending phases. A tombstoned phase keeps
        // whatever status it had and must never come back to life.
        const titrationPhases = (await db.medicationPhases
          .where("titrationPlanId")
          .equals(planId)
          .toArray()).filter((p) => isLive(p) && p.status === "pending");

        for (const phase of titrationPhases) {
          await updateSyncedInsideTx(
            "medicationPhases",
            phase.id,
            { status: "active", startDate: now },
            { now },
          );
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

/**
 * Promote a titration's doses to maintenance. The maintenance phase keeps
 * its own unit and food instruction; its live schedules are retired
 * (tombstoned and disabled, so no reader keeps dosing them) and replaced by
 * copies of the titration phase's live, enabled schedules.
 */
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

        const titrationPhases = (await db.medicationPhases
          .where("titrationPlanId")
          .equals(planId)
          .toArray()).filter(
          (p) => isLive(p) && p.type === "titration" && (p.status === "active" || p.status === "pending"),
        );

        const sf = baseSyncFields();
        for (const titPhase of titrationPhases) {
          const titSchedules = (await liveSchedulesForPhaseInsideTx(titPhase.id))
            .filter((s) => s.enabled === true);

          const rxPhases = await livePhasesForRxInsideTx(titPhase.prescriptionId);
          const maintenancePhase = pickMaintenancePhase(rxPhases);

          if (maintenancePhase) {
            for (const os of await liveSchedulesForPhaseInsideTx(maintenancePhase.id)) {
              await softDeleteInsideTx("phaseSchedules", os, now);
            }

            // Copies keep the titration schedule's own anchor so time and
            // scheduleTimeUTC stay consistent.
            const newSchedules: PhaseSchedule[] = titSchedules.map((s) => ({
              id: crypto.randomUUID(),
              phaseId: maintenancePhase.id,
              time: s.time,
              scheduleTimeUTC: s.scheduleTimeUTC,
              anchorTimezone: s.anchorTimezone,
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

            if (maintenancePhase.status !== "active") {
              await updateSyncedInsideTx(
                "medicationPhases",
                maintenancePhase.id,
                { status: "active" },
                { now },
              );
            }
          }

          await updateSyncedInsideTx(
            "medicationPhases",
            titPhase.id,
            { status: "completed", endDate: now },
            { now },
          );
        }

        await updateSyncedInsideTx("titrationPlans", planId, { status: "completed" }, { now });

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

        const planPhases = (await db.medicationPhases
          .where("titrationPlanId")
          .equals(planId)
          .toArray()).filter(isLive);

        const stoppedRx: string[] = [];
        for (const phase of planPhases) {
          if (phase.status === "active" || phase.status === "pending") {
            if (phase.status === "active") stoppedRx.push(phase.prescriptionId);
            await updateSyncedInsideTx(
              "medicationPhases",
              phase.id,
              { status: "cancelled", endDate: now },
              { now },
            );
          }
        }

        // Put prescriptions whose titration was running back on maintenance.
        await restoreMaintenanceInsideTx(stoppedRx, now);

        await updateSyncedInsideTx("titrationPlans", planId, { status: "cancelled" }, { now });

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
        const planPhases = (await db.medicationPhases
          .where("titrationPlanId")
          .equals(planId)
          .toArray()).filter(isLive);

        // Tombstones also retire their lifecycle flags (cancelled phases,
        // disabled schedules), so readers that only check status/enabled
        // stop dosing them too.
        const stoppedRx = planPhases
          .filter((p) => p.status === "active")
          .map((p) => p.prescriptionId);
        for (const phase of planPhases) {
          await retirePhaseInsideTx(phase, now);
        }
        await restoreMaintenanceInsideTx(stoppedRx, now);

        const plan = await db.titrationPlans.get(planId);
        if (plan && isLive(plan)) {
          await softDeleteInsideTx("titrationPlans", plan, now);
        }

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
