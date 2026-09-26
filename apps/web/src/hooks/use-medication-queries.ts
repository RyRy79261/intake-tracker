"use client";

import { useLiveQuery } from "dexie-react-hooks";
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
} from "@/lib/medication-schedule-service";
import { startNewPhase, updatePhase, deletePhase, activatePhase, type CreatePhaseInput, type UpdatePhaseInput } from "@/lib/medication-service";
import {
  getTitrationPlans,
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
  getDoseLogsWithDetailsForDate,
  takeDose,
  logPrnDose,
  untakeDose,
  skipDose,
  rescheduleDose,
  editDoseTime,
  type DoseLogWithDetails,
  type TakeDoseInput,
  type LogPrnDoseInput,
  type UntakeDoseInput,
  type SkipDoseInput,
  type RescheduleDoseInput,
  type EditDoseTimeInput,
} from "@/lib/dose-log-service";
import {
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
  getDoseLogById,
  getPrnDoseLogs,
  undoPrnDose,
} from "@/lib/dose-action-service";
import type { Prescription, PhaseSchedule, InventoryItem, DoseLog } from "@/lib/db";
import type { ServiceResult } from "@intake/types/service";
import { unwrap } from "@intake/core/service";
import { useTodayKey } from "@/hooks/use-today-key";

// Re-export types so components import from hooks, not services
export type { DoseLogWithDetails, DoseSlot, CreatePhaseInput, CreateTitrationPlanInput, DoseLog, UntakeDoseInput };

// ============================================================================
// Read Hooks — useLiveQuery (no invalidation needed)
// ============================================================================

export function usePrescriptions() {
  return useLiveQuery(() => getPrescriptions(), [], []);
}

export function useDailyDoseSchedule(dateStr: string) {
  // A slot's pending/missed status depends on "today", which the query reads
  // when it runs; re-run it when the day rolls over, not only on DB writes.
  const todayKey = useTodayKey();
  return useLiveQuery(() => getDailyDoseSchedule(dateStr), [dateStr, todayKey]);
}

/** Live as-needed (PRN) dose logs for a prescription since `sinceDate`, newest first. */
export function usePrnDoseLogs(prescriptionId: string, sinceDate: string) {
  return useLiveQuery(
    () => getPrnDoseLogs(prescriptionId, sinceDate),
    [prescriptionId, sinceDate],
    [],
  );
}

export function useDoseLogsForDate(date: string) {
  return useLiveQuery(() => getDoseLogsForDate(date), [date], []);
}

export function useDoseLogsWithDetailsForDate(date: string) {
  return useLiveQuery(() => getDoseLogsWithDetailsForDate(date), [date], []);
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

export function useSchedulesForPhase(phaseId: string | undefined) {
  return useLiveQuery(
    () => phaseId ? getSchedulesForPhase(phaseId) : [],
    [phaseId],
    []
  );
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

export function useDeletePhase() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deletePhase(id)),
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

// ----------------------------------------------------------------------------
// Bulk dose actions. Each slot is its own transaction, so a batch can
// partially succeed: the outcome lists every slot that was written (with the
// log it wrote, for undo) and every slot that failed, instead of throwing
// after the earlier slots have already been committed.
// ----------------------------------------------------------------------------

export interface BulkDoseOutcome<E> {
  succeeded: { entry: E; log: DoseLog }[];
  failed: { entry: E; error: string }[];
}

type SlotKey = { prescriptionId: string; phaseId: string; scheduleId: string };
type BulkDoseEntry = SlotKey & { dosageMg: number };

/** Pick only the slot identity, so callers can pass whole DoseSlots as entries. */
function slotKey(e: SlotKey): SlotKey {
  return { prescriptionId: e.prescriptionId, phaseId: e.phaseId, scheduleId: e.scheduleId };
}

async function runPerSlot<E>(
  entries: E[],
  run: (entry: E) => Promise<ServiceResult<DoseLog>>,
): Promise<BulkDoseOutcome<E>> {
  const outcome: BulkDoseOutcome<E> = { succeeded: [], failed: [] };
  for (const entry of entries) {
    const result = await run(entry);
    if (result.success) outcome.succeeded.push({ entry, log: result.data });
    else outcome.failed.push({ entry, error: result.error });
  }
  return outcome;
}

export function useTakeAllDoses<E extends BulkDoseEntry = BulkDoseEntry>() {
  return useMutation({
    mutationFn: (args: { entries: E[]; date: string; time: string; takenAtTime?: string }) =>
      runPerSlot(args.entries, (e) =>
        takeDose({
          ...slotKey(e),
          dosageMg: e.dosageMg,
          date: args.date,
          time: args.time,
          ...(args.takenAtTime ? { takenAtTime: args.takenAtTime } : {}),
        }),
      ),
  });
}

export function useSkipAllDoses<E extends BulkDoseEntry = BulkDoseEntry>() {
  return useMutation({
    mutationFn: (args: { entries: E[]; date: string; time: string; reason?: string }) =>
      runPerSlot(args.entries, (e) =>
        skipDose({
          ...slotKey(e),
          dosageMg: e.dosageMg,
          date: args.date,
          time: args.time,
          ...(args.reason !== undefined && { reason: args.reason }),
        }),
      ),
  });
}

export function useUntakeAllDoses() {
  return useMutation({
    mutationFn: (entries: UntakeDoseInput[]) => runPerSlot(entries, (e) => untakeDose(e)),
  });
}

export function useEditDoseTime() {
  return useMutation({
    mutationFn: async (input: EditDoseTimeInput) => unwrap(await editDoseTime(input)),
  });
}

export function useEditAllDoseTimes<E extends SlotKey = SlotKey>() {
  return useMutation({
    mutationFn: (args: { entries: E[]; date: string; time: string; newTime: string }) =>
      runPerSlot(args.entries, (e) =>
        editDoseTime({ ...slotKey(e), date: args.date, time: args.time, newTime: args.newTime }),
      ),
  });
}

/**
 * Undo for a take/skip toast. Each target is bound to the log the action
 * wrote: it is reverted (back to pending) only while that log is still live
 * and unchanged — same status, actionTimestamp and skipReason. A dose the
 * user has since changed some other way (skipped with a reason, re-timed,
 * synced from another device) is left alone and counted as stale.
 * updatedAt is deliberately not compared: the sync push ack re-stamps it
 * with the server clock a few seconds after every write, inside the undo
 * window, without changing the dose.
 */
export function useRevertDoseActions() {
  return useMutation({
    mutationFn: async (targets: { input: UntakeDoseInput; log: DoseLog }[]) => {
      const counts = { reverted: 0, stale: 0, failed: 0 };
      for (const { input, log } of targets) {
        const current = await getDoseLogById(log.id);
        if (
          !current ||
          current.status !== log.status ||
          current.actionTimestamp !== log.actionTimestamp ||
          current.skipReason !== log.skipReason
        ) {
          counts.stale++;
          continue;
        }
        const result = await untakeDose(input);
        if (result.success) counts.reverted++;
        else counts.failed++;
      }
      return counts;
    },
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
    mutationFn: async ({ inventoryItemId, amount, note, type }: { inventoryItemId: string; amount: number; note?: string; type?: "refill" | "consumed" | "adjusted" }) =>
      unwrap(await adjustStock(inventoryItemId, amount, note, type)),
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
