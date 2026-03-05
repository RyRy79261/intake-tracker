"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  getDailySchedule,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  getSchedulesForPhase,
} from "@/lib/medication-schedule-service";
import { startNewPhase, updatePhase, deletePhase, activatePhase, type CreatePhaseInput, type UpdatePhaseInput } from "@/lib/medication-service";
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
  updateInventoryItem,
  adjustStock,
  deleteInventoryItem,
} from "@/lib/medication-service";
import type { Prescription, PhaseSchedule, InventoryItem } from "@/lib/db";
import { unwrap } from "@/lib/service-result";

// Re-export DoseLogWithDetails so components import from hooks, not services
export type { DoseLogWithDetails };

export function usePrescriptions() {
  return useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => getPrescriptions(),
  });
}

export function useDailySchedule(dayOfWeek: number) {
  return useQuery({
    queryKey: ["dailySchedule", dayOfWeek],
    queryFn: () => getDailySchedule(dayOfWeek),
  });
}

export function useDoseLogsForDate(date: string) {
  return useQuery({
    queryKey: ["doseLogs", date],
    queryFn: () => getDoseLogsForDate(date),
  });
}

export function useDoseLogsWithDetailsForDate(date: string) {
  return useQuery({
    queryKey: ["doseLogsWithDetails", date],
    queryFn: () => getDoseLogsWithDetailsForDate(date),
  });
}

export function usePhasesForPrescription(prescriptionId: string | undefined) {
  return useQuery({
    queryKey: ["medicationPhases", prescriptionId],
    queryFn: () => getPhasesForPrescription(prescriptionId!),
    enabled: !!prescriptionId,
  });
}

export function useInventoryForPrescription(prescriptionId: string | undefined) {
  return useQuery({
    queryKey: ["inventoryItems", prescriptionId],
    queryFn: () => getInventoryForPrescription(prescriptionId!),
    enabled: !!prescriptionId,
  });
}

export function useInventoryTransactions(inventoryItemId: string | undefined) {
  return useQuery({
    queryKey: ["inventoryTransactions", inventoryItemId],
    queryFn: () => getInventoryTransactions(inventoryItemId!),
    enabled: !!inventoryItemId,
  });
}

export function useAllActiveInventoryItems() {
  return useQuery({
    queryKey: ["inventoryItems", "active"],
    queryFn: () => getAllActiveInventoryItems(),
  });
}

export function useAllInventoryItems() {
  return useQuery({
    queryKey: ["inventoryItems", "all"],
    queryFn: () => getAllInventoryItems(),
  });
}

export function useSchedulesForPhase(phaseId: string | undefined) {
  return useQuery({
    queryKey: ["phaseSchedules", phaseId],
    queryFn: () => getSchedulesForPhase(phaseId!),
    enabled: !!phaseId,
  });
}

function useInvalidateMeds() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["prescriptions"] });
    qc.invalidateQueries({ queryKey: ["dailySchedule"] });
    qc.invalidateQueries({ queryKey: ["doseLogs"] });
    qc.invalidateQueries({ queryKey: ["medicationPhases"] });
    qc.invalidateQueries({ queryKey: ["inventoryItems"] });
    qc.invalidateQueries({ queryKey: ["phaseSchedules"] });
  };
}

export function useAddPrescription() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (input: CreatePrescriptionInput) => unwrap(await addPrescription(input)),
    onSuccess: invalidate,
  });
}

export function useAddMedicationToPrescription() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (input: AddMedicationToPrescriptionInput) => unwrap(await addMedicationToPrescription(input)),
    onSuccess: invalidate,
  });
}

export function useUpdatePrescription() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Omit<Prescription, "id" | "createdAt">> }) =>
      unwrap(await updatePrescription(id, updates)),
    onSuccess: invalidate,
  });
}

export function useDeletePrescription() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deletePrescription(id)),
    onSuccess: invalidate,
  });
}

export function useAddSchedule() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (input: Omit<PhaseSchedule, "id" | "createdAt" | "enabled">) => unwrap(await addSchedule(input)),
    onSuccess: invalidate,
  });
}

export function useUpdateSchedule() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Omit<PhaseSchedule, "id" | "createdAt" | "phaseId">> }) =>
      unwrap(await updateSchedule(id, updates)),
    onSuccess: invalidate,
  });
}

export function useDeleteSchedule() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteSchedule(id)),
    onSuccess: invalidate,
  });
}

export function useStartNewPhase() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (input: CreatePhaseInput) => unwrap(await startNewPhase(input)),
    onSuccess: invalidate,
  });
}

export function useUpdatePhase() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (input: UpdatePhaseInput) => unwrap(await updatePhase(input)),
    onSuccess: invalidate,
  });
}

export function useDeletePhase() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deletePhase(id)),
    onSuccess: invalidate,
  });
}

export function useActivatePhase() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await activatePhase(id)),
    onSuccess: invalidate,
  });
}

export function useTakeDose() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (input: TakeDoseInput) => unwrap(await takeDose(input)),
    onSuccess: invalidate,
  });
}

export function useUntakeDose() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (input: UntakeDoseInput) => unwrap(await untakeDose(input)),
    onSuccess: invalidate,
  });
}

export function useSkipDose() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (input: SkipDoseInput) => unwrap(await skipDose(input)),
    onSuccess: invalidate,
  });
}

export function useRescheduleDose() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (input: RescheduleDoseInput) => unwrap(await rescheduleDose(input)),
    onSuccess: invalidate,
  });
}

export function useTakeAllDoses() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (args: { entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageMg: number }[]; date: string; time: string }) =>
      unwrap(await takeAllDoses(args.entries, args.date, args.time)),
    onSuccess: invalidate,
  });
}

export function useSkipAllDoses() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (args: { entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageMg: number }[]; date: string; time: string; reason?: string }) =>
      unwrap(await skipAllDoses(args.entries, args.date, args.time, args.reason)),
    onSuccess: invalidate,
  });
}

// ============================================================================
// Inventory Item Mutation Hooks
// ============================================================================

export function useUpdateInventoryItem() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Omit<InventoryItem, "id" | "createdAt" | "prescriptionId">> }) =>
      unwrap(await updateInventoryItem(id, updates)),
    onSuccess: invalidate,
  });
}

export function useAdjustStock() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async ({ inventoryItemId, amount, note, type }: { inventoryItemId: string; amount: number; note?: string; type?: "refill" | "consumed" | "adjusted" }) =>
      unwrap(await adjustStock(inventoryItemId, amount, note, type)),
    onSuccess: invalidate,
  });
}

export function useDeleteInventoryItem() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteInventoryItem(id)),
    onSuccess: invalidate,
  });
}
