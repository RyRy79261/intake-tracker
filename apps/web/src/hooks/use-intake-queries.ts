"use client";

import { useCallback } from "react";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useMutation } from "@tanstack/react-query";
import {
  addIntakeRecord,
  updateIntakeRecord,
  deleteIntakeRecord,
  undoDeleteIntakeRecord,
  getRecentRecords,
  getRecordsByDateRange,
  getSaltTotalsByGroupIds,
  getSugarTotalsByGroupIds,
  getPotassiumTotalsByGroupIds,
} from "@/lib/intake-service";
import { unwrap } from "@intake/core/service";
import { withDbRecovery } from "@/lib/db-recovery";
import { useUndoDeleteMutation } from "@/hooks/use-undo-delete-mutation";
import { useDailyTotals, intakeMetric } from "@/hooks/use-daily-totals";
import { useNowTick } from "@intake/ui/use-now-tick";

/**
 * Hook to get recent records for a type (last 3 entries).
 */
export function useRecentIntakeRecords(type: "water" | "salt" | "sugar" | "potassium") {
  return useLiveQuery(() => getRecentRecords(type), [type], []);
}

/**
 * Hook to add an intake record. A write that hits a severed IndexedDB
 * connection reopens it and retries once (see `withDbRecovery`).
 */
export function useAddIntake() {
  return useMutation({
    mutationFn: async ({
      type,
      amount,
      source = "manual",
      timestamp,
      note,
    }: {
      type: "water" | "salt" | "sugar" | "potassium";
      amount: number;
      source?: string;
      timestamp?: number;
      note?: string;
    }) =>
      withDbRecovery(async () =>
        unwrap(await addIntakeRecord(type, amount, source, timestamp, note))
      ),
  });
}

/**
 * Hook to update an intake record.
 */
export function useUpdateIntake() {
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: { amount?: number; timestamp?: number; note?: string; source?: string };
    }) => withDbRecovery(async () => unwrap(await updateIntakeRecord(id, updates))),
  });
}

/**
 * Hook to delete an intake record.
 * Shows an undo toast with ~5 second window per D-08.
 */
export function useDeleteIntake() {
  return useUndoDeleteMutation(deleteIntakeRecord, undoDeleteIntakeRecord);
}

/**
 * Combined hook that provides totals (daily + rolling 24h), records, and actions for a type.
 * Drop-in replacement for the old useIntake hook.
 */
export function useIntake(type: "water" | "salt" | "sugar" | "potassium") {
  // Totals come from the Daily Totals module, so every card agrees with the
  // Today gadget on what counts as today.
  const totals = useDailyTotals().metrics[intakeMetric(type)];
  const dailyTotal = totals.today.value;
  const rollingTotal = totals.rolling24h;
  const addMutation = useAddIntake();
  const deleteMutation = useDeleteIntake();

  const addRecord = useCallback(
    async (amount: number, source: string = "manual", timestamp?: number, note?: string) => {
      return addMutation.mutateAsync({ type, amount, source, ...(timestamp !== undefined && { timestamp }), ...(note !== undefined && { note }) });
    },
    [addMutation, type]
  );

  const removeRecord = useCallback(
    async (id: string) => {
      return deleteMutation.mutateAsync(id);
    },
    [deleteMutation]
  );

  return {
    // Daily total (since day start) - primary metric for budget tracking
    dailyTotal,
    // Rolling 24h total - secondary metric for safety/pacing
    rollingTotal,
    // Legacy: keep 'total' pointing to daily for backward compat, but prefer explicit names
    total: dailyTotal,
    addRecord,
    removeRecord,
  };
}

/**
 * Hook to get intake records within a date range, optionally filtered by type.
 * Uses useLiveQuery for reactive updates. Re-runs every 60s via tick dep.
 */
export function useIntakeRecordsByDateRange(
  startTime: number,
  endTime: number,
  type?: "water" | "salt" | "sugar" | "potassium"
) {
  const tick = useNowTick();
  return useLiveQuery(
    () => getRecordsByDateRange(startTime, endTime, type),
    [startTime, endTime, type, tick],
    []
  );
}

/**
 * Hook to get salt totals keyed by groupId.
 * Used to display sodium amounts alongside eating records in merged history.
 */
export function useSaltTotalsByGroupIds(groupIds: string[]) {
  const key = groupIds.join(",");
  return useLiveQuery(
    () => getSaltTotalsByGroupIds(groupIds),
    [key],
    new Map<string, number>()
  );
}

/**
 * Hook to get sugar totals keyed by groupId.
 * Used to display sugar amounts alongside eating records.
 */
export function useSugarTotalsByGroupIds(groupIds: string[]) {
  const key = groupIds.join(",");
  return useLiveQuery(
    () => getSugarTotalsByGroupIds(groupIds),
    [key],
    new Map<string, number>()
  );
}

/**
 * Hook to get potassium totals keyed by groupId.
 * Used to display potassium amounts alongside eating records.
 */
export function usePotassiumTotalsByGroupIds(groupIds: string[]) {
  const key = groupIds.join(",");
  return useLiveQuery(
    () => getPotassiumTotalsByGroupIds(groupIds),
    [key],
    new Map<string, number>()
  );
}
