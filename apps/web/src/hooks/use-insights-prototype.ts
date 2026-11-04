"use client";

/**
 * PROTOTYPE — throwaway. Reads the last 95 days straight from Dexie (read-only)
 * and runs the insights engine over it. No service layer on purpose.
 */

import { useMemo } from "react";
import { db } from "@/lib/db";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useSettingsStore } from "@/stores/settings-store";
import { getDeviceTimezone } from "@/lib/timezone";
import { runEngine, type EngineInput } from "@/components/analytics/insights-prototype/engine";

const DAYS = 95;

export function usePrototypeInsights() {
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const waterLimit = useSettingsStore((s) => s.waterLimit);
  const saltLimit = useSettingsStore((s) => s.saltLimit);

  const raw = useLiveQuery(async () => {
    const since = Date.now() - DAYS * 86_400_000;
    const sinceDate = new Date(since).toISOString().slice(0, 10);
    const live = <T extends { deletedAt: number | null }>(xs: T[]) => xs.filter((x) => x.deletedAt === null);
    const recent = <T extends { deletedAt: number | null; timestamp: number }>(xs: T[]) =>
      xs.filter((x) => x.deletedAt === null && x.timestamp >= since);
    const [intake, weight, bp, urination, defecation, substance, doseLogs, phases, schedules, prescriptions, journal] =
      await Promise.all([
        db.intakeRecords.toArray().then(recent),
        db.weightRecords.toArray().then(recent),
        db.bloodPressureRecords.toArray().then(recent),
        db.urinationRecords.toArray().then(recent),
        db.defecationRecords.toArray().then(recent),
        db.substanceRecords.toArray().then(recent),
        db.doseLogs.where("scheduledDate").aboveOrEqual(sinceDate).toArray().then(live),
        db.medicationPhases.toArray().then(live),
        db.phaseSchedules.toArray().then(live),
        db.prescriptions.toArray().then(live),
        db.journalEntries.where("timestamp").aboveOrEqual(since).toArray().then(live),
      ]);
    return { intake, weight, bp, urination, defecation, substance, doseLogs, phases, schedules, prescriptions, journal };
  }, []);

  return useMemo(() => {
    if (!raw) return null;
    const input: EngineInput = {
      now: Date.now(),
      tz: getDeviceTimezone(),
      dayStartHour,
      waterLimit,
      saltLimit,
      ...raw,
    };
    return runEngine(input);
  }, [raw, dayStartHour, waterLimit, saltLimit]);
}
