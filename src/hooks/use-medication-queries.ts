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
  untakeDose,
  skipDose,
  rescheduleDose,
  takeAllDoses,
  skipAllDoses,
  type DoseLogWithDetails,
  type TakeDoseInput,
  type UntakeDoseInput,
  type SkipDoseInput,
  type RescheduleDoseInput,
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
import type { Prescription, PhaseSchedule, InventoryItem } from "@/lib/db";
import { unwrap } from "@/lib/service-result";

// Re-export types so components import from hooks, not services
export type { DoseLogWithDetails, DoseSlot, CreatePhaseInput, CreateTitrationPlanInput };

// ============================================================================
// Read Hooks — useLiveQuery (no invalidation needed)
// ============================================================================

export function usePrescriptions() {
  return useLiveQuery(() => getPrescriptions(), [], []);
}

export function useDailyDoseSchedule(dateStr: string) {
  return useLiveQuery(() => getDailyDoseSchedule(dateStr), [dateStr]);
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

export function useAddSchedule() {
  return useMutation({
    mutationFn: async (input: Omit<PhaseSchedule, "id" | "createdAt" | "enabled">) => unwrap(await addSchedule(input)),
  });
}

export function useUpdateSchedule() {
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Omit<PhaseSchedule, "id" | "createdAt" | "phaseId">> }) =>
      unwrap(await updateSchedule(id, updates)),
  });
}

export function useDeleteSchedule() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteSchedule(id)),
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

export function useTakeAllDoses() {
  return useMutation({
    mutationFn: async (args: { entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageMg: number }[]; date: string; time: string; takenAtTime?: string }) =>
      unwrap(await takeAllDoses(args.entries, args.date, args.time, args.takenAtTime)),
  });
}

export function useSkipAllDoses() {
  return useMutation({
    mutationFn: async (args: { entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageMg: number }[]; date: string; time: string; reason?: string }) =>
      unwrap(await skipAllDoses(args.entries, args.date, args.time, args.reason)),
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
