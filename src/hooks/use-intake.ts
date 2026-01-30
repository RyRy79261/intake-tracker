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

export function useIntake(type: "water" | "salt") {
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Live query for records of this type in the last 24 hours
  const records = useLiveQuery(async () => {
    const cutoffTime = Date.now() - TWENTY_FOUR_HOURS_MS;
    const allRecords = await db.intakeRecords
      .where("timestamp")
      .above(cutoffTime)
      .toArray();
    return allRecords.filter((r) => r.type === type);
  }, [type]);

  // Calculate total whenever records change
  useEffect(() => {
    if (records !== undefined) {
      const sum = records.reduce((acc, r) => acc + r.amount, 0);
      setTotal(sum);
      setIsLoading(false);
    }
  }, [records]);

  const addRecord = useCallback(
    async (amount: number, source: string = "manual") => {
      return addIntakeRecord(type, amount, source);
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
