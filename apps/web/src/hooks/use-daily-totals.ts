"use client";

import { useMemo } from "react";
import { db } from "@/lib/db";
import type { IntakeRecord } from "@/lib/db";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNowTick } from "@intake/ui/use-now-tick";
import { useSettingsStore } from "@/stores/settings-store";
import { getDeviceTimezone } from "@/lib/timezone";
import {
  dailyTotals,
  totalsWindow,
  type DailyTotals,
  type MetricKey,
  type TotalsRow,
} from "@intake/core/daily-totals";

const INTAKE_METRIC: Record<IntakeRecord["type"], MetricKey> = {
  water: "water",
  salt: "sodium",
  sugar: "sugar",
  potassium: "potassium",
};

/** The metric an intake type is counted under (the "salt" type is sodium). */
export function intakeMetric(type: IntakeRecord["type"]): MetricKey {
  return INTAKE_METRIC[type];
}

/**
 * Every live intake and substance record from `from` on, as totals rows.
 * No upper bound: a live query only re-runs for writes inside the index range
 * it read, so a range ending at "now" would miss a record stamped a moment
 * later. The totals drop future rows instead.
 */
async function readTotalsRows(from: number): Promise<TotalsRow[]> {
  const [intake, substances] = await Promise.all([
    db.intakeRecords.where("timestamp").aboveOrEqual(from).toArray(),
    db.substanceRecords.where("timestamp").aboveOrEqual(from).toArray(),
  ]);
  const rows: TotalsRow[] = [];
  for (const r of intake) {
    if (r.deletedAt !== null) continue;
    rows.push({ metric: INTAKE_METRIC[r.type], timestamp: r.timestamp, amount: r.amount });
  }
  for (const r of substances) {
    if (r.deletedAt !== null) continue;
    if (r.type === "caffeine") {
      rows.push({ metric: "caffeine", timestamp: r.timestamp, amount: r.amountMg ?? 0 });
    } else if (r.type === "alcohol") {
      rows.push({ metric: "alcohol", timestamp: r.timestamp, amount: r.amountStandardDrinks ?? 0 });
    }
  }
  return rows;
}

/**
 * Today's totals for every metric against the user's targets, with the
 * rolling 24 hours, from one live query. `{ week: true }` also fills the
 * logical week (the Today gadget). See `@intake/core/daily-totals` for the
 * rules. Refreshes on writes and on the minute tick, so it rolls over at the
 * day boundary.
 *
 * `now` is read inside the query, when it runs, so a record logged a moment
 * ago is never later than the `now` it is counted against.
 */
export function useDailyTotals({ week = false }: { week?: boolean } = {}): DailyTotals {
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const waterLimit = useSettingsStore((s) => s.waterLimit);
  const saltLimit = useSettingsStore((s) => s.saltLimit);
  const sugarLimit = useSettingsStore((s) => s.sugarLimit);
  const potassiumLimit = useSettingsStore((s) => s.potassiumLimit);
  const waterBuffer = useSettingsStore((s) => s.waterExtendedBuffer);
  const saltBuffer = useSettingsStore((s) => s.saltExtendedBuffer);
  const sugarBuffer = useSettingsStore((s) => s.sugarExtendedBuffer);
  const tick = useNowTick();
  const tz = getDeviceTimezone();
  const weekStart = week ? weekStartsOn : undefined;

  const read = useLiveQuery(
    async () => {
      const now = Date.now();
      const from = totalsWindow(now, tz, dayStartHour, weekStart).readFrom;
      return { now, rows: await readTotalsRows(from) };
    },
    [tz, dayStartHour, weekStart, tick],
    null,
  );

  return useMemo(
    () =>
      dailyTotals({
        // Before the first read: an empty day at render time.
        now: read?.now ?? Date.now(),
        tz,
        dayStartHour,
        ...(weekStart !== undefined && { weekStartsOn: weekStart }),
        rows: read?.rows ?? [],
        targets: {
          water: { limit: waterLimit, buffer: waterBuffer },
          sodium: { limit: saltLimit, buffer: saltBuffer },
          sugar: { limit: sugarLimit, buffer: sugarBuffer },
          potassium: { limit: potassiumLimit, soft: true },
        },
      }),
    [read, tz, dayStartHour, weekStart, waterLimit, waterBuffer, saltLimit, saltBuffer, sugarLimit, sugarBuffer, potassiumLimit],
  );
}
