"use client";

import { useState, useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type IntakeRecord } from "@/lib/db";
import {
  addIntakeRecord,
  deleteIntakeRecord,
  getTotalInLast24Hours,
} from "@/lib/intake-service";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// Refresh interval for time-based expiry (1 minute)
const REFRESH_INTERVAL_MS = 60 * 1000;

export function useIntake(type: "water" | "salt") {
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Periodic refresh to recalculate 24h cutoff as time passes
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTrigger((t) => t + 1);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Live query for records of this type in the last 24 hours
  // refreshTrigger forces re-evaluation as time passes
  const records = useLiveQuery(async () => {
    const cutoffTime = Date.now() - TWENTY_FOUR_HOURS_MS;
    const allRecords = await db.intakeRecords
      .where("timestamp")
      .aboveOrEqual(cutoffTime)
      .toArray();
    return allRecords.filter((r) => r.type === type);
  }, [type, refreshTrigger]);

  // Calculate total whenever records change
  useEffect(() => {
    if (records !== undefined) {
      const sum = records.reduce((acc, r) => acc + r.amount, 0);
      setTotal(sum);
      setIsLoading(false);
    }
  }, [records]);

  const addRecord = useCallback(
    async (amount: number, source: string = "manual", timestamp?: number) => {
      return addIntakeRecord(type, amount, source, timestamp);
    },
    [type]
  );

  const removeRecord = useCallback(async (id: string) => {
    return deleteIntakeRecord(id);
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const newTotal = await getTotalInLast24Hours(type);
    setTotal(newTotal);
    setIsLoading(false);
  }, [type]);

  return {
    total,
    records: records || [],
    isLoading,
    addRecord,
    removeRecord,
    refresh,
  };
}

export function useAllIntake() {
  const water = useIntake("water");
  const salt = useIntake("salt");

  return { water, salt };
}
