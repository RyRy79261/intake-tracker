"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, type IntakeRecord } from "@/lib/db";
import {
  addIntakeRecord,
  updateIntakeRecord,
  deleteIntakeRecord,
} from "@/lib/intake-service";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute

// Query keys factory
export const intakeKeys = {
  all: ["intake"] as const,
  totals: () => [...intakeKeys.all, "totals"] as const,
  total: (type: "water" | "salt") => [...intakeKeys.totals(), type] as const,
  records: (type: "water" | "salt") => [...intakeKeys.all, "records", type] as const,
};

// Fetch total for a type in the last 24 hours
async function fetchTotal(type: "water" | "salt"): Promise<number> {
  const cutoffTime = Date.now() - TWENTY_FOUR_HOURS_MS;
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
      // Only invalidate the affected type's total
      queryClient.invalidateQueries({ queryKey: intakeKeys.total(variables.type) });
      queryClient.invalidateQueries({ queryKey: intakeKeys.records(variables.type) });
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
      // and timestamp changes could move records in/out of 24h window
      queryClient.invalidateQueries({ queryKey: intakeKeys.totals() });
      queryClient.invalidateQueries({ queryKey: intakeKeys.all });
    },
  });
}

/**
 * Hook to delete an intake record.
 * Invalidates all totals.
 */
export function useDeleteIntake() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteIntakeRecord(id),
    onSuccess: () => {
      // Invalidate all since we don't know which type was affected
      queryClient.invalidateQueries({ queryKey: intakeKeys.totals() });
      queryClient.invalidateQueries({ queryKey: intakeKeys.all });
    },
  });
}

/**
 * Combined hook that provides total, records, and actions for a type.
 * Drop-in replacement for the old useIntake hook.
 */
export function useIntake(type: "water" | "salt") {
  const totalQuery = useIntakeTotal(type);
  const addMutation = useAddIntake();
  const deleteMutation = useDeleteIntake();
  const queryClient = useQueryClient();

  const addRecord = async (amount: number, source: string = "manual", timestamp?: number, note?: string) => {
    return addMutation.mutateAsync({ type, amount, source, timestamp, note });
  };

  const removeRecord = async (id: string) => {
    return deleteMutation.mutateAsync(id);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: intakeKeys.total(type) });
  };

  return {
    total: totalQuery.data ?? 0,
    isLoading: totalQuery.isLoading,
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
