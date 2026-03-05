"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, type DailyNote } from "@/lib/db";
import { syncFields } from "@/lib/utils";

export const dailyNotesKeys = {
  all: ["dailyNotes"] as const,
  byDate: (date: string, prescriptionId?: string) =>
    [...dailyNotesKeys.all, date, prescriptionId] as const,
};

export function useDailyNotes(date: string, prescriptionId?: string) {
  return useQuery({
    queryKey: dailyNotesKeys.byDate(date, prescriptionId),
    queryFn: async () => {
      const query = db.dailyNotes.where("date").equals(date);
      if (prescriptionId) {
        return (await query.toArray()).filter(n => n.prescriptionId === prescriptionId);
      }
      return query.toArray();
    },
  });
}

interface AddDailyNoteInput {
  date: string;
  prescriptionId?: string;
  doseLogId?: string;
  note: string;
}

export function useAddDailyNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddDailyNoteInput) => {
      const entry: DailyNote = {
        id: crypto.randomUUID(),
        date: input.date,
        ...(input.prescriptionId !== undefined && { prescriptionId: input.prescriptionId }),
        ...(input.doseLogId !== undefined && { doseLogId: input.doseLogId }),
        note: input.note,
        ...syncFields(),
      };
      await db.dailyNotes.add(entry);
      return entry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dailyNotesKeys.all });
    },
  });
}
