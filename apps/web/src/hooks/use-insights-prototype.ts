"use client";

/**
 * PROTOTYPE — throwaway. Reads the records a selection needs straight from
 * Dexie (read-only) and runs the insights engine over them. No service layer
 * on purpose.
 */

import { useMemo } from "react";
import { logicalDayKey } from "@intake/core/logical-day";
import { useNowTick } from "@intake/ui/use-now-tick";
import { db } from "@/lib/db";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useSettingsStore } from "@/stores/settings-store";
import { getDeviceTimezone } from "@/lib/timezone";
import {
  localParts,
  resolveSelection,
  runEngine,
  type EngineInput,
  type Selection,
} from "@/components/analytics/insights-prototype/engine";

export function usePrototypeInsights(sel: Selection) {
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const waterLimit = useSettingsStore((s) => s.waterLimit);
  const saltLimit = useSettingsStore((s) => s.saltLimit);
  const sugarLimit = useSettingsStore((s) => s.sugarLimit);
  const potassiumLimit = useSettingsStore((s) => s.potassiumLimit);
  const tz = getDeviceTimezone();

  // Re-read the clock every minute so a relative report moves on when the
  // logical day changes, or when 06:00 ends last night's outcome window,
  // without waiting for a database or settings update.
  const tick = useNowTick();
  const clockKey = useMemo(
    () => {
      const at = Date.now();
      return `${logicalDayKey(at, dayStartHour, tz)}|${localParts(at, tz).hour >= 6}`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick forces a re-read of the clock
    [tick, dayStartHour, tz],
  );
  // One clock reading per logical day (and per side of 06:00): the loaded
  // records and the report use the same window.
  const { now, win } = useMemo(() => {
    const at = Date.now();
    return { now: at, win: resolveSelection({ now: at, tz, dayStartHour }, sel) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clockKey forces a re-read of the clock
  }, [sel, clockKey, dayStartHour, tz]);

  const { start, end, firstKey, lastKey } = win.load;
  const raw = useLiveQuery(async () => {
    const live = <T extends { deletedAt: number | null }>(xs: T[]) => xs.filter((x) => x.deletedAt === null);
    const [intake, eating, weight, bp, urination, defecation, substance, doseLogs, phases, schedules, prescriptions, journal] =
      await Promise.all([
        db.intakeRecords.where("timestamp").between(start, end, true, true).toArray().then(live),
        db.eatingRecords.where("timestamp").between(start, end, true, true).toArray().then(live),
        db.weightRecords.where("timestamp").between(start, end, true, true).toArray().then(live),
        db.bloodPressureRecords.where("timestamp").between(start, end, true, true).toArray().then(live),
        db.urinationRecords.where("timestamp").between(start, end, true, true).toArray().then(live),
        db.defecationRecords.where("timestamp").between(start, end, true, true).toArray().then(live),
        db.substanceRecords.where("timestamp").between(start, end, true, true).toArray().then(live),
        db.doseLogs.where("scheduledDate").between(firstKey, lastKey, true, true).toArray().then(live),
        db.medicationPhases.toArray().then(live),
        db.phaseSchedules.toArray().then(live),
        db.prescriptions.toArray().then(live),
        db.journalEntries.where("timestamp").between(start, end, true, true).toArray().then(live),
      ]);
    return { loaded: `${start}|${end}|${firstKey}|${lastKey}`, records: { intake, eating, weight, bp, urination, defecation, substance, doseLogs, phases, schedules, prescriptions, journal } };
  }, [start, end, firstKey, lastKey]);

  return useMemo(() => {
    // Until the records for this window arrive (the last result is for the previous one).
    if (!raw || raw.loaded !== `${start}|${end}|${firstKey}|${lastKey}`) return null;
    const input: EngineInput = {
      // The current time, so a rescheduled dose's wait is re-checked each
      // minute (the window itself stays keyed on the clock reading above).
      now: Math.max(now, Date.now()),
      tz,
      dayStartHour,
      waterLimit,
      saltLimit,
      sugarLimit,
      potassiumLimit,
      ...raw.records,
    };
    return runEngine(input, sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick re-reads the clock each minute
  }, [raw, start, end, firstKey, lastKey, now, tick, tz, dayStartHour, waterLimit, saltLimit, sugarLimit, potassiumLimit, sel]);
}
