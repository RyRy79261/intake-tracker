"use client";

import { useCallback } from "react";
import { useLiveQuery } from "@/hooks/use-live-query";
import {
  addSubstanceRecord,
  getSubstanceRecords,
  getSubstanceRecordsByDateRange,
  deleteSubstanceRecord,
  updateSubstanceRecord,
  type AddSubstanceInput,
} from "@/lib/substance-service";
import { unwrap } from "@intake/core/service";
import { useNowTick } from "@intake/ui/use-now-tick";
import type { SubstanceRecord } from "@/lib/db";

/**
 * Hook to get substance records with optional type filter.
 * Uses useLiveQuery for reactive updates with [] default.
 */
export function useSubstanceRecords(type?: 'caffeine' | 'alcohol') {
  return useLiveQuery(() => getSubstanceRecords(type), [type], []);
}

/**
 * Hook to get substance records within a date range with optional type filter.
 * Uses useLiveQuery for reactive updates with [] default.
 */
export function useSubstanceRecordsByDateRange(
  startTime: number,
  endTime: number,
  type?: 'caffeine' | 'alcohol'
) {
  return useLiveQuery(
    () => getSubstanceRecordsByDateRange(startTime, endTime, type),
    [startTime, endTime, type],
    []
  );
}

/**
 * Hook to get substance records from `startTime` up to now. The index range
 * is open-ended and "now" is applied at query time rather than memoised in
 * the caller: a live query only re-runs for writes inside the range it read,
 * so a fixed `now` end excluded a record logged a moment later until the next
 * minute tick. Future-dated records stay out, matching the intake totals.
 */
export function useSubstanceRecordsSince(
  startTime: number,
  type?: 'caffeine' | 'alcohol'
) {
  const tick = useNowTick();
  return useLiveQuery(
    async () => {
      const records = await getSubstanceRecordsByDateRange(startTime, Infinity, type);
      const now = Date.now();
      return records.filter((r) => r.timestamp <= now);
    },
    [startTime, type, tick],
    []
  );
}

/**
 * Hook to add a substance record. Returns a mutation function.
 */
export function useAddSubstance() {
  return useCallback(async (input: AddSubstanceInput) => {
    return unwrap(await addSubstanceRecord(input));
  }, []);
}

/**
 * Hook to delete a substance record. Returns a mutation function.
 */
export function useDeleteSubstance() {
  return useCallback(async (id: string) => {
    return unwrap(await deleteSubstanceRecord(id));
  }, []);
}

/**
 * Hook to update a substance record. Returns a mutation function.
 */
export function useUpdateSubstance() {
  return useCallback(
    async (id: string, updates: Partial<SubstanceRecord>) => {
      return unwrap(await updateSubstanceRecord(id, updates));
    },
    [],
  );
}
