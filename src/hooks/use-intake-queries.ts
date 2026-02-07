"use client";

import { useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { db, type IntakeRecord } from "@/lib/db";
import { useSettingsStore } from "@/stores/settings-store";
import * as storageAdapter from "@/lib/storage-adapter";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute

type AuthHeaders = { Authorization: string };

// Query keys factory
export const intakeKeys = {
  all: ["intake"] as const,
  totals: () => [...intakeKeys.all, "totals"] as const,
  total: (type: "water" | "salt", storageMode: string) => 
    [...intakeKeys.totals(), type, storageMode] as const,
  dailyTotals: () => [...intakeKeys.all, "dailyTotals"] as const,
  dailyTotal: (type: "water" | "salt", dayStartHour: number, storageMode: string) => 
    [...intakeKeys.dailyTotals(), type, dayStartHour, storageMode] as const,
  records: (type: "water" | "salt", storageMode: string) => 
    [...intakeKeys.all, "records", type, storageMode] as const,
  recent: (type: "water" | "salt", storageMode: string) => 
    [...intakeKeys.all, "recent", type, storageMode] as const,
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

// ==================== Local Fetch Functions ====================

async function fetchTotalLocal(type: "water" | "salt"): Promise<number> {
  const cutoffTime = Date.now() - TWENTY_FOUR_HOURS_MS;
  const records = await db.intakeRecords
    .where("timestamp")
    .aboveOrEqual(cutoffTime)
    .filter((r) => r.type === type)
    .toArray();
  return records.reduce((sum, r) => sum + r.amount, 0);
}

async function fetchDailyTotalLocal(type: "water" | "salt", dayStartHour: number): Promise<number> {
  const cutoffTime = getDayStartTimestamp(dayStartHour);
  const records = await db.intakeRecords
    .where("timestamp")
    .aboveOrEqual(cutoffTime)
    .filter((r) => r.type === type)
    .toArray();
  return records.reduce((sum, r) => sum + r.amount, 0);
}

async function fetchRecordsLocal(type: "water" | "salt"): Promise<IntakeRecord[]> {
  const cutoffTime = Date.now() - TWENTY_FOUR_HOURS_MS;
  const records = await db.intakeRecords
    .where("timestamp")
    .aboveOrEqual(cutoffTime)
    .filter((r) => r.type === type)
    .toArray();
  return records;
}

async function fetchRecentRecordsLocal(type: "water" | "salt"): Promise<IntakeRecord[]> {
  const records = await db.intakeRecords
    .where("type")
    .equals(type)
    .toArray();
  return records.sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
}

// ==================== Server Fetch Functions ====================

async function fetchTotalServer(
  type: "water" | "salt", 
  authHeaders: AuthHeaders
): Promise<number> {
  const records = await storageAdapter.getRecordsInLast24Hours(type, authHeaders);
  return records.reduce((sum, r) => sum + r.amount, 0);
}

async function fetchDailyTotalServer(
  type: "water" | "salt", 
  dayStartHour: number,
  authHeaders: AuthHeaders
): Promise<number> {
  const cutoffTime = getDayStartTimestamp(dayStartHour);
  const records = await storageAdapter.getRecordsByDateRange(
    cutoffTime, 
    Date.now(), 
    type, 
    authHeaders
  );
  return records.reduce((sum, r) => sum + r.amount, 0);
}

async function fetchRecordsServer(
  type: "water" | "salt",
  authHeaders: AuthHeaders
): Promise<IntakeRecord[]> {
  return storageAdapter.getRecordsInLast24Hours(type, authHeaders);
}

async function fetchRecentRecordsServer(
  type: "water" | "salt",
  authHeaders: AuthHeaders
): Promise<IntakeRecord[]> {
  // Server doesn't have a "recent" endpoint, so we get all and slice
  const records = await storageAdapter.getAllIntakeRecords(authHeaders);
  return records
    .filter(r => r.type === type)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);
}

// ==================== Hooks ====================

/**
 * Hook to get the total intake for a type in the last 24 hours.
 * Automatically refreshes every minute to handle rolling 24h window.
 * Supports both local and server storage modes.
 */
export function useIntakeTotal(type: "water" | "salt") {
  const queryClient = useQueryClient();
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);
  
  // Periodic refresh for rolling 24h window
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: intakeKeys.total(type, storageMode) });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [queryClient, type, storageMode]);

  return useQuery({
    queryKey: intakeKeys.total(type, storageMode),
    queryFn: async () => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return fetchTotalServer(type, { Authorization: `Bearer ${token}` });
        }
      }
      return fetchTotalLocal(type);
    },
    // Refetch when auth state or storage mode changes
    enabled: storageMode === "local" || authenticated,
  });
}

/**
 * Hook to get the total intake for a type since the configured day start.
 * Uses the dayStartHour from settings (default 2am).
 * Automatically refreshes every minute.
 */
export function useDailyIntakeTotal(type: "water" | "salt") {
  const queryClient = useQueryClient();
  const { authenticated, getAccessToken } = usePrivy();
  const dayStartHour = useSettingsStore((state) => state.dayStartHour);
  const storageMode = useSettingsStore((state) => state.storageMode);
  
  // Periodic refresh for day window
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ 
        queryKey: intakeKeys.dailyTotal(type, dayStartHour, storageMode) 
      });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [queryClient, type, dayStartHour, storageMode]);

  return useQuery({
    queryKey: intakeKeys.dailyTotal(type, dayStartHour, storageMode),
    queryFn: async () => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return fetchDailyTotalServer(type, dayStartHour, { Authorization: `Bearer ${token}` });
        }
      }
      return fetchDailyTotalLocal(type, dayStartHour);
    },
    enabled: storageMode === "local" || authenticated,
  });
}

/**
 * Hook to get records for a type in the last 24 hours.
 */
export function useIntakeRecords(type: "water" | "salt") {
  const queryClient = useQueryClient();
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);
  
  // Periodic refresh for rolling 24h window
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: intakeKeys.records(type, storageMode) });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [queryClient, type, storageMode]);

  return useQuery({
    queryKey: intakeKeys.records(type, storageMode),
    queryFn: async () => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return fetchRecordsServer(type, { Authorization: `Bearer ${token}` });
        }
      }
      return fetchRecordsLocal(type);
    },
    enabled: storageMode === "local" || authenticated,
  });
}

/**
 * Hook to get recent records for a type (last 3 entries).
 */
export function useRecentIntakeRecords(type: "water" | "salt") {
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

  return useQuery({
    queryKey: intakeKeys.recent(type, storageMode),
    queryFn: async () => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return fetchRecentRecordsServer(type, { Authorization: `Bearer ${token}` });
        }
      }
      return fetchRecentRecordsLocal(type);
    },
    enabled: storageMode === "local" || authenticated,
  });
}

/**
 * Hook to add an intake record.
 * Automatically invalidates the relevant queries.
 * Routes to local or server based on storage mode.
 */
export function useAddIntake() {
  const queryClient = useQueryClient();
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

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
    }) => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return storageAdapter.addIntakeRecord(
            type, amount, source, timestamp, note,
            { Authorization: `Bearer ${token}` }
          );
        }
      }
      return storageAdapter.addIntakeRecord(type, amount, source, timestamp, note);
    },
    onSuccess: (_, variables) => {
      // Invalidate all affected queries for this type
      queryClient.invalidateQueries({ queryKey: intakeKeys.totals() });
      queryClient.invalidateQueries({ queryKey: intakeKeys.dailyTotals() });
      queryClient.invalidateQueries({ queryKey: intakeKeys.records(variables.type, storageMode) });
      queryClient.invalidateQueries({ queryKey: intakeKeys.recent(variables.type, storageMode) });
    },
  });
}

/**
 * Hook to update an intake record.
 * Invalidates all totals since timestamp changes could affect windows.
 */
export function useUpdateIntake() {
  const queryClient = useQueryClient();
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: { amount?: number; timestamp?: number; note?: string };
    }) => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return storageAdapter.updateIntakeRecord(
            id, updates,
            { Authorization: `Bearer ${token}` }
          );
        }
      }
      return storageAdapter.updateIntakeRecord(id, updates);
    },
    onSuccess: () => {
      // Invalidate all totals since we don't know which type was affected
      // and timestamp changes could move records in/out of windows
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
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

  return useMutation({
    mutationFn: async (id: string) => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return storageAdapter.deleteIntakeRecord(id, { Authorization: `Bearer ${token}` });
        }
      }
      return storageAdapter.deleteIntakeRecord(id);
    },
    onSuccess: () => {
      // Invalidate all intake queries since we don't know which type was affected
      queryClient.invalidateQueries({ queryKey: intakeKeys.all });
    },
  });
}

/**
 * Combined hook that provides totals (daily + rolling 24h), records, and actions for a type.
 * Drop-in replacement for the old useIntake hook.
 * Supports both local and server storage modes.
 */
export function useIntake(type: "water" | "salt") {
  const rollingTotalQuery = useIntakeTotal(type);
  const dailyTotalQuery = useDailyIntakeTotal(type);
  const addMutation = useAddIntake();
  const deleteMutation = useDeleteIntake();
  const queryClient = useQueryClient();
  const dayStartHour = useSettingsStore((state) => state.dayStartHour);
  const storageMode = useSettingsStore((state) => state.storageMode);

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
    queryClient.invalidateQueries({ queryKey: intakeKeys.total(type, storageMode) });
    queryClient.invalidateQueries({ queryKey: intakeKeys.dailyTotal(type, dayStartHour, storageMode) });
  }, [queryClient, type, dayStartHour, storageMode]);

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
