"use client";

import { useState, useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useMutation } from "@tanstack/react-query";
import {
  addIntakeRecord,
  updateIntakeRecord,
  deleteIntakeRecord,
  undoDeleteIntakeRecord,
  getTotalInLast24Hours,
  getRecordsInLast24Hours,
  getDailyTotal,
  getRecentRecords,
} from "@/lib/intake-service";
import { unwrap } from "@/lib/service-result";
import { showUndoToast } from "@/components/medications/undo-toast";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * Get the timestamp for when the current "day" started based on the configurable hour.
 * For example, if dayStartHour is 2 (2am):
 * - At 3am on Monday, returns 2am Monday
 * - At 1am on Monday, returns 2am Sunday (previous day's start)
 */
export function getDayStartTimestamp(dayStartHour: number): number {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(dayStartHour, 0, 0, 0);

  // If current time is before day start hour, use previous day's start
  if (now < dayStart) {
    dayStart.setDate(dayStart.getDate() - 1);
  }
  return dayStart.getTime();
}


/**
 * Hook to get the total intake for a type in the last 24 hours.
 * Uses useLiveQuery for reactive updates. Re-runs every 60s via tick dep
 * to handle rolling 24h window boundary.
 */
export function useIntakeTotal(type: "water" | "salt") {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  return useLiveQuery(() => getTotalInLast24Hours(type), [type, tick], 0);
}

/**
 * Hook to get the total intake for a type since the configured day start.
 * Uses the dayStartHour from settings (default 2am).
 * Re-runs every 60s via tick dep.
 */
export function useDailyIntakeTotal(type: "water" | "salt") {
  const dayStartHour = useSettingsStore((state) => state.dayStartHour);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  return useLiveQuery(() => getDailyTotal(type, dayStartHour), [type, dayStartHour, tick], 0);
}

/**
 * Hook to get records for a type in the last 24 hours.
 */
export function useIntakeRecords(type: "water" | "salt") {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  return useLiveQuery(() => getRecordsInLast24Hours(type), [type, tick], []);
}

/**
 * Hook to get recent records for a type (last 3 entries).
 */
export function useRecentIntakeRecords(type: "water" | "salt") {
  return useLiveQuery(() => getRecentRecords(type), [type], []);
}

/**
 * Hook to add an intake record.
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
      type: "water" | "salt";
      amount: number;
      source?: string;
      timestamp?: number;
      note?: string;
    }) => unwrap(await addIntakeRecord(type, amount, source, timestamp, note)),
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
      updates: { amount?: number; timestamp?: number; note?: string };
    }) => unwrap(await updateIntakeRecord(id, updates)),
  });
}

/**
 * Hook to delete an intake record.
 * Shows an undo toast with ~5 second window per D-08.
 */
export function useDeleteIntake() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteIntakeRecord(id)),
    onSuccess: (_data, id) => {
      showUndoToast({
        title: "Record deleted",
        onUndo: () => { undoDeleteIntakeRecord(id); },
      });
    },
  });
}

/**
 * Combined hook that provides totals (daily + rolling 24h), records, and actions for a type.
 * Drop-in replacement for the old useIntake hook.
 */
export function useIntake(type: "water" | "salt") {
  const rollingTotal = useIntakeTotal(type);
  const dailyTotal = useDailyIntakeTotal(type);
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
    dailyTotal: dailyTotal ?? 0,
    // Rolling 24h total - secondary metric for safety/pacing
    rollingTotal: rollingTotal ?? 0,
    // Legacy: keep 'total' pointing to daily for backward compat, but prefer explicit names
    total: dailyTotal ?? 0,
    isLoading: dailyTotal === undefined || rollingTotal === undefined,
    addRecord,
    removeRecord,
  };
}

/**
 * Combined hook for both water and salt intake.
 */
export function useAllIntake() {
  const water = useIntake("water");
  const salt = useIntake("salt");

  return { water, salt };
}
