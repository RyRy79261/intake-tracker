"use client";

import { useMutation } from "@tanstack/react-query";
import { unwrap } from "@intake/core/service";
import { isBloodThinner } from "@intake/core/journal";
import { useLiveQuery } from "@/hooks/use-live-query";
import {
  addJournalEntry,
  deleteJournalEntry,
  getJournalEntries,
  type NewJournalEntry,
} from "@/lib/journal-service";
import { getActivePrescriptions } from "@/lib/prescription-service";
import { getWeightRecordsByDateRange } from "@/lib/health-service";

/** Every live journal entry, newest first. */
export function useJournalEntries() {
  return useLiveQuery(() => getJournalEntries(), [], undefined);
}

export function useAddJournalEntry() {
  return useMutation({
    mutationFn: async (input: NewJournalEntry) => unwrap(await addJournalEntry(input)),
  });
}

export function useDeleteJournalEntry() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteJournalEntry(id)),
  });
}

/** Whether an anticoagulant or antiplatelet is on the active medication list. */
export function useOnBloodThinners(): boolean {
  return useLiveQuery(
    async () => (await getActivePrescriptions()).some((p) => isBloodThinner(p.genericName)),
    [],
    false,
  );
}

/** Weight readings from the last 3 days, for the rapid-gain notice. */
export function useRecentWeights(now: number) {
  // Rounded to the hour so the query does not re-run every render.
  const hour = Math.floor(now / 3_600_000) * 3_600_000;
  return useLiveQuery(
    () => getWeightRecordsByDateRange(hour - 3 * 86_400_000, hour + 3_600_000),
    [hour],
    [],
  );
}
