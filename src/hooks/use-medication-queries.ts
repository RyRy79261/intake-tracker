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
} from "@/lib/dose-log-service";
import type { Prescription, PhaseSchedule } from "@/lib/db";

export function usePrescriptions() {
  return useQuery({
    queryKey: ["prescriptions"],
    queryFn: getPrescriptions,
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
    queryFn: getAllActiveInventoryItems,
  });
}

export function useAllInventoryItems() {
  return useQuery({
    queryKey: ["inventoryItems", "all"],
    queryFn: getAllInventoryItems,
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
    mutationFn: (input: CreatePrescriptionInput) => addPrescription(input),
    onSuccess: invalidate,
  });
}

export function useAddMedicationToPrescription() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (input: AddMedicationToPrescriptionInput) => addMedicationToPrescription(input),
    onSuccess: invalidate,
  });
}

export function useUpdatePrescription() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<Prescription, "id" | "createdAt">> }) =>
      updatePrescription(id, updates),
    onSuccess: invalidate,
  });
}

export function useDeletePrescription() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (id: string) => deletePrescription(id),
    onSuccess: invalidate,
  });
}

export function useAddSchedule() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (input: Omit<PhaseSchedule, "id" | "createdAt" | "enabled">) => addSchedule(input),
    onSuccess: invalidate,
  });
}

export function useUpdateSchedule() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<PhaseSchedule, "id" | "createdAt" | "phaseId">> }) =>
      updateSchedule(id, updates),
    onSuccess: invalidate,
  });
}

export function useDeleteSchedule() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (id: string) => deleteSchedule(id),
    onSuccess: invalidate,
  });
}

export function useStartNewPhase() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (input: CreatePhaseInput) => startNewPhase(input),
    onSuccess: invalidate,
  });
}

export function useUpdatePhase() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (input: UpdatePhaseInput) => updatePhase(input),
    onSuccess: invalidate,
  });
}

export function useDeletePhase() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (id: string) => deletePhase(id),
    onSuccess: invalidate,
  });
}

export function useActivatePhase() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (id: string) => activatePhase(id),
    onSuccess: invalidate,
  });
}

export function useTakeDose() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (args: { prescriptionId: string; phaseId: string; scheduleId: string; date: string; time: string; dosageAmount: number }) =>
      takeDose(args.prescriptionId, args.phaseId, args.scheduleId, args.date, args.time, args.dosageAmount),
    onSuccess: invalidate,
  });
}

export function useUntakeDose() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (args: { prescriptionId: string; phaseId: string; scheduleId: string; date: string; time: string; dosageAmount: number }) =>
      untakeDose(args.prescriptionId, args.phaseId, args.scheduleId, args.date, args.time, args.dosageAmount),
    onSuccess: invalidate,
  });
}

export function useSkipDose() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (args: { prescriptionId: string; phaseId: string; scheduleId: string; date: string; time: string; dosageAmount: number; reason?: string }) =>
      skipDose(args.prescriptionId, args.phaseId, args.scheduleId, args.date, args.time, args.dosageAmount, args.reason),
    onSuccess: invalidate,
  });
}

export function useRescheduleDose() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (args: { prescriptionId: string; phaseId: string; scheduleId: string; date: string; time: string; newTime: string; dosageAmount: number }) =>
      rescheduleDose(args.prescriptionId, args.phaseId, args.scheduleId, args.date, args.time, args.newTime, args.dosageAmount),
    onSuccess: invalidate,
  });
}

export function useTakeAllDoses() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (args: { entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageAmount: number }[]; date: string; time: string }) =>
      takeAllDoses(args.entries, args.date, args.time),
    onSuccess: invalidate,
  });
}

export function useSkipAllDoses() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (args: { entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageAmount: number }[]; date: string; time: string; reason?: string }) =>
      skipAllDoses(args.entries, args.date, args.time, args.reason),
    onSuccess: invalidate,
  });
}
