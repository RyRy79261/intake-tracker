import {
  db,
  type TitrationPlan,
  type MedicationPhase,
  type PhaseSchedule,
} from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { baseSyncFields } from "@/lib/utils";
import { localHHMMStringToUTCMinutes } from "@/lib/timezone";
import { getScheduleAnchorTimezone } from "@/lib/schedule-anchor";
import { isLive } from "@intake/core/lifecycle";
import { toLocalDateKey } from "@/lib/date-utils";
import { syncedWrite, type SyncedWriter } from "@/lib/synced-write";
import { writeScheduleChange } from "@/lib/medication-schedule-service";
import type { ChangeDayRule } from "@intake/core/schedule-window";

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
async function reconcileSchedules(
  w: SyncedWriter,
  phaseId: string,
  inputs: readonly TitrationScheduleInput[],
  ctx: { tz: string; deviceId: string },
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
    await w.patch("phaseSchedules", existing.id, {
      dosage: input.dosage,
      daysOfWeek: input.daysOfWeek,
      enabled: true,
      ...(input.time !== existing.time && {
        time: input.time,
        scheduleTimeUTC: localHHMMStringToUTCMinutes(input.time, ctx.tz),
        anchorTimezone: ctx.tz,
      }),
    });
  }
  for (const input of unmatchedInputs.slice(pairs)) {
    const schedule = newSchedule(phaseId, input, ctx.tz, ctx.deviceId, w.now);
    await w.insert("phaseSchedules", schedule);
  }
  for (const stale of unmatchedExisting.slice(pairs)) {
    await w.tombstone("phaseSchedules", stale.id);
  }
}

/** Tombstone a phase and its schedules; running/pending phases become cancelled. */
async function retirePhase(w: SyncedWriter, phase: MedicationPhase): Promise<void> {
  for (const s of await liveSchedulesForPhaseInsideTx(phase.id)) {
    await w.tombstone("phaseSchedules", s.id);
  }
  await w.tombstone("medicationPhases", phase.id);
}

/**
 * After a running titration stops without being promoted, put each
 * prescription back on its maintenance dose — but only when no maintenance
 * phase is already running for it.
 */
async function restoreMaintenance(w: SyncedWriter, prescriptionIds: Iterable<string>): Promise<void> {
  for (const rxId of new Set(prescriptionIds)) {
    const rxPhases = await livePhasesForRxInsideTx(rxId);
    const latest = pickMaintenancePhase(rxPhases);
    if (latest && latest.status !== "active") {
      await w.patch("medicationPhases", latest.id, { status: "active" });
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
    const tz = getScheduleAnchorTimezone();

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

    await syncedWrite(["titrationPlans", "medicationPhases", "phaseSchedules"], async (w) => {
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

      await w.insert("titrationPlans", plan);
      for (const p of phases) await w.insert("medicationPhases", p);
      for (const s of schedules) await w.insert("phaseSchedules", s);

      await w.audit("phase_started", {
        titrationPlanId: plan.id,
        title: plan.title,
        prescriptionCount: input.entries.length,
      });
    });

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
  /**
   * First day a running titration's new schedules apply ("YYYY-MM-DD",
   * default today, not before today). Days before it keep the old rows. A
   * plan that has not started is edited in place.
   */
  applyFrom?: string;
  /** Test seam: the change-day rule (default DEFAULT_CHANGE_DAY_RULE). */
  changeDayRule?: ChangeDayRule;
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
    const tz = getScheduleAnchorTimezone();

    const planUpdates: Partial<Omit<TitrationPlan, "id" | "updatedAt">> = {};
    if (input.title !== undefined) planUpdates.title = input.title;
    if (input.conditionLabel !== undefined) planUpdates.conditionLabel = input.conditionLabel;
    if (input.recommendedStartDate !== undefined) planUpdates.recommendedStartDate = input.recommendedStartDate;
    if (input.notes !== undefined) planUpdates.notes = input.notes;
    if (input.warnings !== undefined) planUpdates.warnings = input.warnings;

    await syncedWrite(["titrationPlans", "medicationPhases", "phaseSchedules", "doseLogs"], async (w) => {
      await w.patch("titrationPlans", plan.id, planUpdates);

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
              await w.patch("medicationPhases", existing.id, changes);
            }
            if (existing.status === "active") {
              // A running titration: the change applies from a date, so the
              // days before it keep their time and dose. The drawer sends
              // every entry; one the user did not change keeps its rows (and
              // a pending change keeps its date).
              await writeScheduleChange(w, existing.id, entry.schedules, {
                ...(input.applyFrom !== undefined && { applyFrom: input.applyFrom }),
                ...(input.changeDayRule !== undefined && { rule: input.changeDayRule }),
                ...(existing.unit && { closedUnit: existing.unit, unit }),
                skipIfNewest: true,
              });
            } else {
              await reconcileSchedules(w, existing.id, entry.schedules, { tz, deviceId: sf.deviceId });
            }
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
          await w.insert("medicationPhases", phase);
          for (const s of entry.schedules) {
            const schedule = newSchedule(phase.id, s, tz, sf.deviceId, now);
            await w.insert("phaseSchedules", schedule);
          }
        }

        const removed = [
          ...planPhases.filter((p) => !keptRx.has(p.prescriptionId)),
          ...surplus,
        ];
        for (const phase of removed) {
          await retirePhase(w, phase);
        }
      }

      await w.audit("titration_plan_updated", {
        titrationPlanId: plan.id,
        title: input.title ?? plan.title,
      });
    });

    const updated = await db.titrationPlans.get(plan.id);
    return ok(updated!);
  } catch (e) {
    return err(
      e instanceof Error && e.message.startsWith("Pick ") ? e.message : "Failed to update titration plan",
      e,
    );
  }
}

export async function activateTitrationPlan(
  planId: string,
): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await syncedWrite(["titrationPlans", "medicationPhases"], async (w) => {
      const plan = await db.titrationPlans.get(planId);
      if (!plan) throw new Error("Titration plan not found");

      await w.patch("titrationPlans", planId, { status: "active" });

      // Activate the plan's live pending phases. A tombstoned phase keeps
      // whatever status it had and must never come back to life.
      const titrationPhases = (await db.medicationPhases
        .where("titrationPlanId")
        .equals(planId)
        .toArray()).filter((p) => isLive(p) && p.status === "pending");

      for (const phase of titrationPhases) {
        await w.patch("medicationPhases", phase.id, { status: "active", startDate: now });
      }

      await w.audit("phase_activated", {
        titrationPlanId: planId,
        title: plan.title,
        phasesActivated: titrationPhases.length,
      });
    });

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

    await syncedWrite(["titrationPlans", "medicationPhases", "phaseSchedules"], async (w) => {
      const plan = await db.titrationPlans.get(planId);
      if (!plan) throw new Error("Titration plan not found");

      const titrationPhases = (await db.medicationPhases
        .where("titrationPlanId")
        .equals(planId)
        .toArray()).filter(
        (p) => isLive(p) && p.type === "titration" && (p.status === "active" || p.status === "pending"),
      );

      const sf = baseSyncFields();
      const todayKey = toLocalDateKey(now);
      for (const titPhase of titrationPhases) {
        // The rows in effect from today on: a row an "Apply from" edit
        // already closed is history.
        const titSchedules = (await liveSchedulesForPhaseInsideTx(titPhase.id))
          .filter((s) => s.enabled === true && (!s.effectiveTo || s.effectiveTo > todayKey));

        const rxPhases = await livePhasesForRxInsideTx(titPhase.prescriptionId);
        const maintenancePhase = pickMaintenancePhase(rxPhases);

        if (maintenancePhase) {
          for (const os of await liveSchedulesForPhaseInsideTx(maintenancePhase.id)) {
            await w.tombstone("phaseSchedules", os.id);
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
            // A pending "Apply from" change keeps its dates.
            ...(s.effectiveFrom && s.effectiveFrom > todayKey && { effectiveFrom: s.effectiveFrom }),
            ...(s.effectiveTo && { effectiveTo: s.effectiveTo }),
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            deviceId: sf.deviceId,
          }));
          for (const ns of newSchedules) await w.insert("phaseSchedules", ns);

          if (maintenancePhase.status !== "active") {
            await w.patch("medicationPhases", maintenancePhase.id, { status: "active" });
          }
        }

        await w.patch("medicationPhases", titPhase.id, { status: "completed", endDate: now });
      }

      await w.patch("titrationPlans", planId, { status: "completed" });

      await w.audit("phase_completed", {
        titrationPlanId: planId,
        title: plan.title,
        action: "titration_completed_and_promoted",
      });
    });

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

    await syncedWrite(["titrationPlans", "medicationPhases"], async (w) => {
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
          await w.patch("medicationPhases", phase.id, { status: "cancelled", endDate: now });
        }
      }

      // Put prescriptions whose titration was running back on maintenance.
      await restoreMaintenance(w, stoppedRx);

      await w.patch("titrationPlans", planId, { status: "cancelled" });

      await w.audit("phase_completed", {
        titrationPlanId: planId,
        title: plan.title,
        action: "titration_cancelled",
      });
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to cancel titration plan", e);
  }
}

export async function deleteTitrationPlan(
  planId: string,
): Promise<ServiceResult<void>> {
  try {
    await syncedWrite(["titrationPlans", "medicationPhases", "phaseSchedules"], async (w) => {
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
        await retirePhase(w, phase);
      }
      await restoreMaintenance(w, stoppedRx);

      const plan = await db.titrationPlans.get(planId);
      if (plan && isLive(plan)) {
        await w.tombstone("titrationPlans", plan.id);
      }

      await w.audit("phase_completed", {
        titrationPlanId: planId,
        action: "titration_deleted",
      });
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to delete titration plan", e);
  }
}
