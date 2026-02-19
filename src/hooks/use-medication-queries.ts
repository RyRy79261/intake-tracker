"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMedications,
  addMedication,
  updateMedication,
  deleteMedication,
  type CreateMedicationInput,
} from "@/lib/medication-service";
import {
  getDailySchedule,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  getSchedulesForMedication,
  type CreateScheduleInput,
} from "@/lib/medication-schedule-service";
import {
  getDoseLogsForDate,
  takeDose,
  untakeDose,
  skipDose,
  rescheduleDose,
  takeAllDoses,
  skipAllDoses,
} from "@/lib/dose-log-service";
import type { Medication, MedicationSchedule } from "@/lib/db";

export function useMedications() {
  return useQuery({
    queryKey: ["medications"],
    queryFn: getMedications,
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

export function useMedicationSchedules(medicationId: string | undefined) {
  return useQuery({
    queryKey: ["medicationSchedules", medicationId],
    queryFn: () => getSchedulesForMedication(medicationId!),
    enabled: !!medicationId,
  });
}

function useInvalidateMeds() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["medications"] });
    qc.invalidateQueries({ queryKey: ["dailySchedule"] });
    qc.invalidateQueries({ queryKey: ["doseLogs"] });
    qc.invalidateQueries({ queryKey: ["medicationSchedules"] });
  };
}

export function useAddMedication() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (input: CreateMedicationInput) => addMedication(input),
    onSuccess: invalidate,
  });
}

export function useUpdateMedication() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<Medication, "id" | "createdAt">> }) =>
      updateMedication(id, updates),
    onSuccess: invalidate,
  });
}

export function useDeleteMedication() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (id: string) => deleteMedication(id),
    onSuccess: invalidate,
  });
}

export function useAddSchedule() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (input: CreateScheduleInput) => addSchedule(input),
    onSuccess: invalidate,
  });
}

export function useUpdateSchedule() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<MedicationSchedule, "id" | "createdAt">> }) =>
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

export function useTakeDose() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (args: { medicationId: string; scheduleId: string; date: string; time: string; dosageAmount: number }) =>
      takeDose(args.medicationId, args.scheduleId, args.date, args.time, args.dosageAmount),
    onSuccess: invalidate,
  });
}

export function useUntakeDose() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (args: { medicationId: string; scheduleId: string; date: string; time: string; dosageAmount: number }) =>
      untakeDose(args.medicationId, args.scheduleId, args.date, args.time, args.dosageAmount),
    onSuccess: invalidate,
  });
}

export function useSkipDose() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (args: { medicationId: string; scheduleId: string; date: string; time: string; reason?: string }) =>
      skipDose(args.medicationId, args.scheduleId, args.date, args.time, args.reason),
    onSuccess: invalidate,
  });
}

export function useRescheduleDose() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (args: { medicationId: string; scheduleId: string; date: string; time: string; newTime: string }) =>
      rescheduleDose(args.medicationId, args.scheduleId, args.date, args.time, args.newTime),
    onSuccess: invalidate,
  });
}

export function useTakeAllDoses() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (args: { entries: { medicationId: string; scheduleId: string; dosageAmount: number }[]; date: string; time: string }) =>
      takeAllDoses(args.entries, args.date, args.time),
    onSuccess: invalidate,
  });
}

export function useSkipAllDoses() {
  const invalidate = useInvalidateMeds();
  return useMutation({
    mutationFn: (args: { entries: { medicationId: string; scheduleId: string }[]; date: string; time: string; reason?: string }) =>
      skipAllDoses(args.entries, args.date, args.time, args.reason),
    onSuccess: invalidate,
  });
}
