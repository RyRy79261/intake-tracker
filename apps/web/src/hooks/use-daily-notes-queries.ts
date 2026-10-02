"use client";

import { useLiveQuery } from "@/hooks/use-live-query";
import { useMutation } from "@tanstack/react-query";
import { isLive } from "@intake/core/lifecycle";
import { db, type DailyNote } from "@/lib/db";
import { syncFields } from "@/lib/utils";
import { writeWithSync } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";

/** Live (non-soft-deleted) notes for a day, optionally scoped to one prescription. */
export function useDailyNotes(date: string, prescriptionId?: string) {
  return useLiveQuery(
    async () => {
      const notes = await db.dailyNotes.where("date").equals(date).toArray();
      return notes.filter(
        (n) =>
          isLive(n) &&
          (prescriptionId === undefined || n.prescriptionId === prescriptionId),
      );
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
      // Same write path as every other synced table: the row and its queue
      // entry commit atomically, then a debounced push is scheduled.
      await writeWithSync("dailyNotes", "upsert", async () => {
        await db.dailyNotes.add(entry);
        return entry;
      });
      schedulePush();
      return entry;
    },
  });
}
