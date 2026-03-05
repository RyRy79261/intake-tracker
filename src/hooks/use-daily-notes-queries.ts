"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMutation } from "@tanstack/react-query";
import { db, type DailyNote } from "@/lib/db";
import { syncFields } from "@/lib/utils";

export function useDailyNotes(date: string, prescriptionId?: string) {
  return useLiveQuery(
    async () => {
      const query = db.dailyNotes.where("date").equals(date);
      if (prescriptionId) {
        return (await query.toArray()).filter(n => n.prescriptionId === prescriptionId);
      }
      return query.toArray();
    },
    [date, prescriptionId],
    []
  );
}

interface AddDailyNoteInput {
  date: string;
  prescriptionId?: string;
  doseLogId?: string;
  note: string;
}

export function useAddDailyNote() {
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
  });
}
