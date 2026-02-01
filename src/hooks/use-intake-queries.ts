"use client";

import { useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, type IntakeRecord } from "@/lib/db";
import {
  addIntakeRecord,
  updateIntakeRecord,
  deleteIntakeRecord,
} from "@/lib/intake-service";
import { useSettingsStore } from "@/stores/settings-store";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute

// Query keys factory
export const intakeKeys = {
  all: ["intake"] as const,
  totals: () => [...intakeKeys.all, "totals"] as const,
  total: (type: "water" | "salt") => [...intakeKeys.totals(), type] as const,
  dailyTotals: () => [...intakeKeys.all, "dailyTotals"] as const,
  dailyTotal: (type: "water" | "salt", dayStartHour: number) => 
    [...intakeKeys.dailyTotals(), type, dayStartHour] as const,
  records: (type: "water" | "salt") => [...intakeKeys.all, "records", type] as const,
  recent: (type: "water" | "salt") => [...intakeKeys.all, "recent", type] as const,
};

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

// Fetch total for a type in the last 24 hours (rolling window)
async function fetchTotal(type: "water" | "salt"): Promise<number> {
  const cutoffTime = Date.now() - TWENTY_FOUR_HOURS_MS;
  const records = await db.intakeRecords
    .where("timestamp")
    .aboveOrEqual(cutoffTime)
    .filter((r) => r.type === type)
    .toArray();
  return records.reduce((sum, r) => sum + r.amount, 0);
}

// Fetch total for a type since the day start (daily budget)
async function fetchDailyTotal(type: "water" | "salt", dayStartHour: number): Promise<number> {
  const cutoffTime = getDayStartTimestamp(dayStartHour);
  const records = await db.intakeRecords
    .where("timestamp")
    .aboveOrEqual(cutoffTime)
    .filter((r) => r.type === type)
    .toArray();
  return records.reduce((sum, r) => sum + r.amount, 0);
}

// Fetch records for a type in the last 24 hours
async function fetchRecords(type: "water" | "salt"): Promise<IntakeRecord[]> {
  const cutoffTime = Date.now() - TWENTY_FOUR_HOURS_MS;
  const records = await db.intakeRecords
    .where("timestamp")
    .aboveOrEqual(cutoffTime)
    .filter((r) => r.type === type)
    .toArray();
  return records;
}

// Fetch recent records for a type (last 3, sorted by timestamp desc)
async function fetchRecentRecords(type: "water" | "salt"): Promise<IntakeRecord[]> {
  const records = await db.intakeRecords
    .where("type")
    .equals(type)
    .toArray();
  return records.sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
}

/**
 * Hook to get the total intake for a type in the last 24 hours.
 * Automatically refreshes every minute to handle rolling 24h window.
 */
export function useIntakeTotal(type: "water" | "salt") {
  const queryClient = useQueryClient();
  
  // Periodic refresh for rolling 24h window
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: intakeKeys.total(type) });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [queryClient, type]);

  return useQuery({
    queryKey: intakeKeys.total(type),
    queryFn: () => fetchTotal(type),
  });
}

/**
 * Hook to get the total intake for a type since the configured day start.
 * Uses the dayStartHour from settings (default 2am).
 * Automatically refreshes every minute.
 */
export function useDailyIntakeTotal(type: "water" | "salt") {
  const queryClient = useQueryClient();
  const dayStartHour = useSettingsStore((state) => state.dayStartHour);
  
  // Periodic refresh for day window
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: intakeKeys.dailyTotal(type, dayStartHour) });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [queryClient, type, dayStartHour]);

  return useQuery({
    queryKey: intakeKeys.dailyTotal(type, dayStartHour),
    queryFn: () => fetchDailyTotal(type, dayStartHour),
  });
}

/**
 * Hook to get records for a type in the last 24 hours.
 */
export function useIntakeRecords(type: "water" | "salt") {
  const queryClient = useQueryClient();
  
  // Periodic refresh for rolling 24h window
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: intakeKeys.records(type) });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [queryClient, type]);

  return useQuery({
    queryKey: intakeKeys.records(type),
    queryFn: () => fetchRecords(type),
  });
}

/**
 * Hook to get recent records for a type (last 3 entries).
 */
export function useRecentIntakeRecords(type: "water" | "salt") {
  return useQuery({
    queryKey: intakeKeys.recent(type),
    queryFn: () => fetchRecentRecords(type),
  });
}

/**
 * Hook to add an intake record.
 * Automatically invalidates the relevant total query.
 */
export function useAddIntake() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
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
    }) => addIntakeRecord(type, amount, source, timestamp, note),
    onSuccess: (_, variables) => {
      // Invalidate all affected queries for this type
      queryClient.invalidateQueries({ queryKey: intakeKeys.total(variables.type) });
      queryClient.invalidateQueries({ queryKey: intakeKeys.dailyTotals() });
      queryClient.invalidateQueries({ queryKey: intakeKeys.records(variables.type) });
      queryClient.invalidateQueries({ queryKey: intakeKeys.recent(variables.type) });
    },
  });
}

/**
 * Hook to update an intake record.
 * Invalidates all totals since timestamp changes could affect 24h window.
 */
export function useUpdateIntake() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: { amount?: number; timestamp?: number; note?: string };
    }) => updateIntakeRecord(id, updates),
    onSuccess: () => {
      // Invalidate all totals since we don't know which type was affected
      // and timestamp changes could move records in/out of windows
      queryClient.invalidateQueries({ queryKey: intakeKeys.totals() });
      queryClient.invalidateQueries({ queryKey: intakeKeys.dailyTotals() });
      queryClient.invalidateQueries({ queryKey: intakeKeys.all });
    },
  });
}

/**
 * Hook to delete an intake record.
 * Invalidates all queries since we don't know the type.
 */
export function useDeleteIntake() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteIntakeRecord(id),
    onSuccess: () => {
      // Invalidate all intake queries since we don't know which type was affected
      queryClient.invalidateQueries({ queryKey: intakeKeys.all });
    },
  });
}

/**
 * Combined hook that provides totals (daily + rolling 24h), records, and actions for a type.
 * Drop-in replacement for the old useIntake hook.
 */
export function useIntake(type: "water" | "salt") {
  const rollingTotalQuery = useIntakeTotal(type);
  const dailyTotalQuery = useDailyIntakeTotal(type);
  const addMutation = useAddIntake();
  const deleteMutation = useDeleteIntake();
  const queryClient = useQueryClient();
  const dayStartHour = useSettingsStore((state) => state.dayStartHour);

  const addRecord = useCallback(
    async (amount: number, source: string = "manual", timestamp?: number, note?: string) => {
      return addMutation.mutateAsync({ type, amount, source, timestamp, note });
    },
    [addMutation, type]
  );

  const removeRecord = useCallback(
    async (id: string) => {
      return deleteMutation.mutateAsync(id);
    },
    [deleteMutation]
  );

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: intakeKeys.total(type) });
    queryClient.invalidateQueries({ queryKey: intakeKeys.dailyTotal(type, dayStartHour) });
  }, [queryClient, type, dayStartHour]);

  return {
    // Daily total (since day start) - primary metric for budget tracking
    dailyTotal: dailyTotalQuery.data ?? 0,
    // Rolling 24h total - secondary metric for safety/pacing
    rollingTotal: rollingTotalQuery.data ?? 0,
    // Legacy: keep 'total' pointing to daily for backward compat, but prefer explicit names
    total: dailyTotalQuery.data ?? 0,
    isLoading: rollingTotalQuery.isLoading || dailyTotalQuery.isLoading,
    addRecord,
    removeRecord,
    refresh,
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
