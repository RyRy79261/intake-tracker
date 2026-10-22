"use client";

import { useLiveQuery } from "@/hooks/use-live-query";
import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  getPrescriptions,
  addPrescription,
  updatePrescription,
  deletePrescription,
  getPhasesForPrescription,
  getInventoryForPrescription,
  getAllActiveInventoryItems,
  getAllInventoryItems,
  getInventoryTransactions,
  addMedicationToPrescription,
  type CreatePrescriptionInput,
  type AddMedicationToPrescriptionInput,
} from "@/lib/medication-service";
import {
  addSchedule,
  updateSchedule,
  deleteSchedule,
  getSchedulesForPhase,
  getLatestSchedulesForPhase,
  getPendingScheduleChange,
} from "@/lib/medication-schedule-service";
export type { ScheduleChangeOutcome, PendingScheduleChange } from "@/lib/medication-schedule-service";
export { scheduleDoseUnit } from "@/lib/medication-schedule-service";
import { startNewPhase, updatePhase, activatePhase, type CreatePhaseInput, type UpdatePhaseInput } from "@/lib/medication-service";
import {
  getTitrationPlans,
  getDueTitrationPlans,
  getPhasesForTitrationPlan,
  getConditionLabels,
  createTitrationPlan,
  updateTitrationPlan,
  activateTitrationPlan,
  completeTitrationPlan,
  cancelTitrationPlan,
  deleteTitrationPlan,
  type CreateTitrationPlanInput,
  type UpdateTitrationPlanInput,
} from "@/lib/titration-service";
import {
  getDoseLogsForDate,
  takeDose,
  logPrnDose,
  untakeDose,
  skipDose,
  unskipDose,
  rescheduleDose,
  rescheduleDoses,
  cancelReschedule,
  getRescheduleWarnings,
  editDoseTime,
  takeDoses,
  skipDoses,
  untakeDoses,
  unskipDoses,
  setSkipReason,
  revertDoseChanges,
  DoseRuleError,
  type DoseChange,
  type DoseKey,
  type TakeDoseInput,
  type LogPrnDoseInput,
  type UntakeDoseInput,
  type UnskipDoseInput,
  type SkipDoseInput,
  type RescheduleDoseInput,
  type CancelRescheduleInput,
  type DoseRescheduleWarning,
  type EditDoseTimeInput,
} from "@/lib/dose-log-service";
import {
  getCarriedOverDoses,
  getDailyDoseSchedule,
  type DoseSlot,
} from "@/lib/dose-schedule-service";
import {
  updateInventoryItem,
  adjustStock,
  deleteInventoryItem,
  updateInventoryTransaction,
  deleteInventoryTransaction,
} from "@/lib/medication-service";
import {
  getLastTakenDose,
  getPrnDoseLogs,
  undoPrnDose,
} from "@/lib/dose-action-service";
import type { Prescription, PhaseSchedule, InventoryItem, DoseLog } from "@/lib/db";
import { unwrap } from "@intake/core/service";
import { resolveLiveDoseStatus } from "@intake/core/dose-rules";
import { useTodayKey } from "@/hooks/use-today-key";
import { useNow } from "@/hooks/use-now";
import { useSettingsStore } from "@/stores/settings-store";

// Re-export types so components import from hooks, not services
export type {
  DoseSlot, CreatePhaseInput, CreateTitrationPlanInput, DoseLog, UntakeDoseInput, DoseChange, DoseKey,
  DoseRescheduleWarning,
};
export { getRescheduleWarnings, DoseRuleError };

// ============================================================================
// Read Hooks — useLiveQuery (no invalidation needed)
// ============================================================================

export function usePrescriptions() {
  return useLiveQuery(() => getPrescriptions(), [], []);
}

/**
 * The dose slots of a day, with each slot's LIVE status: an open dose turns
 * Missed as soon as its reminder period ends, on the same day
 * (resolveLiveDoseStatus), and the screen updates on its own while open.
 */
export function useDailyDoseSchedule(dateStr: string) {
  // Re-run the query when the day rolls over, not only on DB writes.
  const todayKey = useTodayKey();
  const slots = useLiveQuery(() => getDailyDoseSchedule(dateStr), [dateStr, todayKey]);
  const now = useNow();
  const period = useSettingsStore((s) => s.reminderPeriodMinutes);
  return useMemo(() => withLiveStatus(slots, now, period), [slots, now, period]);
}

/**
 * Doses of other days rescheduled into `dateStr` ("Moved to today"),
 * with their live status. Only today has the group; other days get [].
 */
export function useCarriedOverDoses(dateStr: string) {
  const todayKey = useTodayKey();
  const isToday = dateStr === todayKey;
  const period = useSettingsStore((s) => s.reminderPeriodMinutes);
  const slots = useLiveQuery(
    () => (isToday ? getCarriedOverDoses(dateStr, undefined, period) : Promise.resolve([])),
    [dateStr, isToday, period],
  );
  const now = useNow();
  return useMemo(() => {
    const live = withLiveStatus(slots, now, period);
    // The group lasts until the dose is taken, skipped or missed.
    return live?.filter((s) => s.status === "pending");
  }, [slots, now, period]);
}

/** Slots with the live status at `now`; the same array when nothing changed. */
export function withLiveStatus<S extends DoseSlot>(
  slots: S[] | undefined,
  now: number,
  reminderPeriodMinutes: number,
): S[] | undefined {
  if (!slots) return slots;
  let changed = false;
  const out = slots.map((slot) => {
    const status = resolveLiveDoseStatus(slot.existingLog?.status, slot.dueAt, now, reminderPeriodMinutes);
    if (status === slot.status) return slot;
    changed = true;
    return { ...slot, status };
  });
  return changed ? out : slots;
}

/** Live as-needed (PRN) dose logs for a prescription since `sinceDate`, newest first. */
export function usePrnDoseLogs(prescriptionId: string, sinceDate: string) {
  return useLiveQuery(
    () => getPrnDoseLogs(prescriptionId, sinceDate),
    [prescriptionId, sinceDate],
    [],
  );
}

/** The latest taken dose of a prescription, other than `excludeId`. */
export function useLastTakenDose(prescriptionId: string | undefined, excludeId?: string) {
  return useLiveQuery(
    () => (prescriptionId ? getLastTakenDose(prescriptionId, excludeId) : Promise.resolve(undefined)),
    [prescriptionId, excludeId],
  );
}

export function useDoseLogsForDate(date: string) {
  return useLiveQuery(() => getDoseLogsForDate(date), [date], []);
}

export function usePhasesForPrescription(prescriptionId: string | undefined) {
  return useLiveQuery(
    () => prescriptionId ? getPhasesForPrescription(prescriptionId) : [],
    [prescriptionId],
    []
  );
}

/**
 * Loading-aware companion to `usePhasesForPrescription`: `false` until the
 * phases query first resolves, then `true`. `usePhasesForPrescription` returns
 * its `[]` default while loading — indistinguishable from "genuinely no
 * phases" — so callers that must not treat a still-loading scheduled
 * prescription as as-needed (e.g. the PRN button) gate on this. No default, so
 * `useLiveQuery` yields `undefined` until the first result.
 */
export function usePhasesLoaded(prescriptionId: string | undefined): boolean {
  return (
    useLiveQuery(
      () =>
        prescriptionId
          ? getPhasesForPrescription(prescriptionId).then(() => true)
          : Promise.resolve(true),
      [prescriptionId],
    ) === true
  );
}

export function useInventoryForPrescription(prescriptionId: string | undefined) {
  return useLiveQuery(
    () => prescriptionId ? getInventoryForPrescription(prescriptionId) : [],
    [prescriptionId],
    []
  );
}

export function useInventoryTransactions(inventoryItemId: string | undefined) {
  return useLiveQuery(
    () => inventoryItemId ? getInventoryTransactions(inventoryItemId) : [],
    [inventoryItemId],
    []
  );
}

export function useAllActiveInventoryItems() {
  return useLiveQuery(() => getAllActiveInventoryItems(), [], []);
}

export function useAllInventoryItems() {
  return useLiveQuery(() => getAllInventoryItems(), [], []);
}

/** The phase's schedules in effect today. */
export function useSchedulesForPhase(phaseId: string | undefined) {
  return useLiveQuery(
    () => phaseId ? getSchedulesForPhase(phaseId) : [],
    [phaseId],
    []
  );
}

/** The phase's newest schedules, also a change that starts later ("Apply from"). */
export function useLatestSchedulesForPhase(phaseId: string | undefined) {
  return useLiveQuery(
    () => phaseId ? getLatestSchedulesForPhase(phaseId) : [],
    [phaseId],
    []
  );
}

/** A saved schedule change that starts after today, if any. */
export function usePendingScheduleChange(phaseId: string | undefined) {
  return useLiveQuery(
    async () => (phaseId ? (await getPendingScheduleChange(phaseId)) ?? null : null),
    [phaseId],
    null,
  );
}

/**
 * The newest day a saved change starts, over the given phases (the titration
 * drawer's "Apply from" starts there). `undefined` when none is pending.
 */
export function useNewestPendingChangeDay(phaseIds: readonly string[]) {
  const key = phaseIds.join(",");
  return useLiveQuery(
    async () => {
      const days = await Promise.all(
        key ? key.split(",").map(async (id) => (await getPendingScheduleChange(id))?.steps.at(-1)?.startsOn) : [],
      );
      return days.filter((d): d is string => !!d).sort().at(-1) ?? null;
    },
    [key],
    null,
  ) ?? undefined;
}

// ============================================================================
// Mutation Hooks — useMutation (no invalidation needed, useLiveQuery detects changes)
// ============================================================================

export function useAddPrescription() {
  return useMutation({
    mutationFn: async (input: CreatePrescriptionInput) => unwrap(await addPrescription(input)),
  });
}

export function useAddMedicationToPrescription() {
  return useMutation({
    mutationFn: async (input: AddMedicationToPrescriptionInput) => unwrap(await addMedicationToPrescription(input)),
  });
}

export function useUpdatePrescription() {
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Omit<Prescription, "id" | "createdAt">> }) =>
      unwrap(await updatePrescription(id, updates)),
  });
}

export function useDeletePrescription() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deletePrescription(id)),
  });
}

function resyncNotifications() {
  import("@/lib/local-notifications").then((m) => m.syncMedicationNotifications());
}

export function useAddSchedule() {
  return useMutation({
    mutationFn: async (input: Omit<PhaseSchedule, "id" | "createdAt" | "enabled">) => unwrap(await addSchedule(input)),
    onSuccess: resyncNotifications,
  });
}

export function useUpdateSchedule() {
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Omit<PhaseSchedule, "id" | "createdAt" | "phaseId">> }) =>
      unwrap(await updateSchedule(id, updates)),
    onSuccess: resyncNotifications,
  });
}

export function useDeleteSchedule() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteSchedule(id)),
    onSuccess: resyncNotifications,
  });
}

export function useStartNewPhase() {
  return useMutation({
    mutationFn: async (input: CreatePhaseInput) => unwrap(await startNewPhase(input)),
  });
}

export function useUpdatePhase() {
  return useMutation({
    mutationFn: async (input: UpdatePhaseInput) => unwrap(await updatePhase(input)),
  });
}

export function useActivatePhase() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await activatePhase(id)),
  });
}

export function useTakeDose() {
  return useMutation({
    mutationFn: async (input: TakeDoseInput) => unwrap(await takeDose(input)),
  });
}

export function useLogPrnDose() {
  return useMutation({
    mutationFn: async (input: LogPrnDoseInput) => unwrap(await logPrnDose(input)),
  });
}

export function useUntakeDose() {
  return useMutation({
    mutationFn: async (input: UntakeDoseInput) => unwrap(await untakeDose(input)),
  });
}

export function useSkipDose() {
  return useMutation({
    mutationFn: async (input: SkipDoseInput) => unwrap(await skipDose(input)),
  });
}

export function useRescheduleDose() {
  return useMutation({
    mutationFn: async (input: RescheduleDoseInput) => unwrap(await rescheduleDose(input)),
  });
}

/** Reschedule every open dose to one instant, in one synced write. */
export function useRescheduleDoses<K extends DoseKey = DoseKey>() {
  return useMutation({
    mutationFn: async (args: { entries: K[]; remindAt: number; onlyOpen?: boolean }) =>
      unwrap(
        await rescheduleDoses(args.entries, args.remindAt, {
          ...(args.onlyOpen !== undefined && { onlyOpen: args.onlyOpen }),
        }),
      ),
  });
}

/** "Cancel reschedule": the dose is due at its original time again. */
export function useCancelReschedule() {
  return useMutation({
    mutationFn: async (input: CancelRescheduleInput) => unwrap(await cancelReschedule(input)),
  });
}

export function useUnskipDose() {
  return useMutation({
    mutationFn: async (input: UnskipDoseInput) => unwrap(await unskipDose(input)),
  });
}

// ----------------------------------------------------------------------------
// Bulk dose actions ("Mark all doses"). One synced write per action: all the
// doses change or none do. Each returns the doses it changed, with their
// log before, so Undo can restore them exactly.
// ----------------------------------------------------------------------------

export function useTakeDoses<K extends DoseKey = DoseKey>() {
  return useMutation({
    mutationFn: async (args: { entries: K[]; takenAt?: number; onlyOpen?: boolean }) =>
      unwrap(
        await takeDoses(args.entries, {
          ...(args.takenAt !== undefined && { takenAt: args.takenAt }),
          ...(args.onlyOpen !== undefined && { onlyOpen: args.onlyOpen }),
        }),
      ),
  });
}

export function useSkipDoses<K extends DoseKey = DoseKey>() {
  return useMutation({
    mutationFn: async (args: { entries: K[]; reason?: string; onlyOpen?: boolean }) =>
      unwrap(
        await skipDoses(args.entries, {
          ...(args.reason !== undefined && { reason: args.reason }),
          ...(args.onlyOpen !== undefined && { onlyOpen: args.onlyOpen }),
        }),
      ),
  });
}

export function useUntakeDoses<K extends DoseKey = DoseKey>() {
  return useMutation({
    mutationFn: async (entries: K[]) => unwrap(await untakeDoses(entries)),
  });
}

export function useUnskipDoses<K extends DoseKey = DoseKey>() {
  return useMutation({
    mutationFn: async (entries: K[]) => unwrap(await unskipDoses(entries)),
  });
}

/** Give skipped doses the reason picked after the skip. */
export function useSetSkipReason() {
  return useMutation({
    mutationFn: async (args: { logIds: string[]; reason: string }) =>
      unwrap(await setSkipReason(args.logIds, args.reason)),
  });
}

export function useEditDoseTime() {
  return useMutation({
    mutationFn: async (input: EditDoseTimeInput) => unwrap(await editDoseTime(input)),
  });
}

/**
 * Undo for a dose toast: each changed dose goes back to exactly its state
 * before the action, while it is still as the action left it (see
 * revertDoseChanges). Returns how many were reverted and how many had
 * changed since (stale).
 */
export function useRevertDoseChanges() {
  return useMutation({
    mutationFn: async (changes: DoseChange[]) => unwrap(await revertDoseChanges(changes)),
  });
}

/** Remove a mistaken as-needed dose and put its pills back in stock. */
export function useUndoPrnDose() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await undoPrnDose(id)),
  });
}

// ============================================================================
// Inventory Item Mutation Hooks
// ============================================================================

export function useUpdateInventoryItem() {
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Omit<InventoryItem, "id" | "createdAt" | "prescriptionId">> }) =>
      unwrap(await updateInventoryItem(id, updates)),
  });
}

export function useAdjustStock() {
  return useMutation({
    mutationFn: async ({ inventoryItemId, amount, note, type, occurredAt }: {
      inventoryItemId: string;
      amount: number;
      note?: string;
      type?: "refill" | "consumed" | "adjusted";
      /** Backdate the movement (e.g. a refill collected earlier). */
      occurredAt?: number;
    }) =>
      unwrap(await adjustStock(inventoryItemId, amount, note, type, occurredAt)),
  });
}

export function useDeleteInventoryItem() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteInventoryItem(id)),
  });
}

export function useUpdateInventoryTransaction() {
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { amount?: number; note?: string } }) =>
      unwrap(await updateInventoryTransaction(id, updates)),
  });
}

export function useDeleteInventoryTransaction() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteInventoryTransaction(id)),
  });
}

// ============================================================================
// Titration Plan Hooks
// ============================================================================

export function useTitrationPlans() {
  return useLiveQuery(() => getTitrationPlans(), [], []);
}

/**
 * Draft titration plans whose start date has arrived (`todayKey` is the local
 * YYYY-MM-DD). They wait for the user to confirm; nothing starts on its own.
 */
export function useDueTitrationPlans(todayKey: string) {
  return useLiveQuery(() => getDueTitrationPlans(todayKey), [todayKey], []);
}

export function usePhasesForTitrationPlan(planId: string | undefined) {
  return useLiveQuery(
    () => (planId ? getPhasesForTitrationPlan(planId) : []),
    [planId],
    [],
  );
}

export function useConditionLabels() {
  return useLiveQuery(() => getConditionLabels(), [], []);
}

export function useCreateTitrationPlan() {
  return useMutation({
    mutationFn: async (input: CreateTitrationPlanInput) =>
      unwrap(await createTitrationPlan(input)),
  });
}

export function useUpdateTitrationPlan() {
  return useMutation({
    mutationFn: async (input: UpdateTitrationPlanInput) =>
      unwrap(await updateTitrationPlan(input)),
  });
}

export function useActivateTitrationPlan() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await activateTitrationPlan(id)),
  });
}

export function useCompleteTitrationPlan() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await completeTitrationPlan(id)),
  });
}

export function useCancelTitrationPlan() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await cancelTitrationPlan(id)),
  });
}

export function useDeleteTitrationPlan() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteTitrationPlan(id)),
  });
}
