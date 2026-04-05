"use client";

import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  addSubstanceRecord,
  getSubstanceRecords,
  getSubstanceRecordsByDateRange,
  deleteSubstanceRecord,
  type AddSubstanceInput,
} from "@/lib/substance-service";
import { unwrap } from "@/lib/service-result";

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
