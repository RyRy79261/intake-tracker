"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MAP_LOW_THRESHOLD,
  PPP_LOW_THRESHOLD,
  dailyDerivedBloodPressure,
  deriveBloodPressure,
  type DailyDerivedBloodPressure,
} from "@intake/core/bp-derived";
import { logicalDayKey, logicalDayStart, shiftDayKey } from "@intake/core/logical-day";
import { useNowTick } from "@intake/ui/use-now-tick";
import { SubToggle } from "@/components/domain-scope";
import { useBloodPressureRecordsInRange } from "@/hooks/use-health-queries";
import { getDeviceTimezone } from "@/lib/timezone";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";

/** Days of history behind the sparklines. */
export const TREND_DAYS = 14;
/** Device-only: whether the trends panel was left open. */
export const TRENDS_OPEN_KEY = "bp-derived-trends-open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(TRENDS_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOpen(open: boolean) {
  try {
    localStorage.setItem(TRENDS_OPEN_KEY, open ? "1" : "0");
  } catch {
    // Storage unavailable: the panel still toggles, it just isn't remembered.
  }
}

interface SparklineProps {
  values: number[];
  lo: number;
  hi: number;
  /** A dashed reference line, in the same units as `values`. */
  reference?: number;
  label: string;
}

/**
 * A small single-series line, last point emphasised. [lo, hi] is the usual
 * range; it widens to fit any value outside it, so a fall below the range
 * still shows as a fall instead of a flat line on the floor.
 */
function Sparkline({ values, lo, hi, reference, label }: SparklineProps) {
  if (values.length < 2) {
    return <p className="h-[26px] text-[0.6875rem] leading-[26px] text-muted-foreground">Needs 2 days</p>;
  }
  const w = 100;
  const h = 26;
  const min = Math.min(lo, ...values, ...(reference !== undefined ? [reference] : []));
  const max = Math.max(hi, ...values);
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - 2 - ((v - min) / (max - min)) * (h - 4);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label} className="block h-[26px] w-full text-bp">
      {reference !== undefined && (
        <line
          x1={0}
          x2={w}
          y1={y(reference)}
          y2={y(reference)}
          className="stroke-muted-foreground"
          strokeDasharray="2 2"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.5} fill="currentColor" />
    </svg>
  );
}

interface TileProps {
  label: string;
  value: string;
  unit: string;
  note: string;
  flagged?: boolean;
  children: React.ReactNode;
}

function Tile({ label, value, unit, note, flagged, children }: TileProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2 [&+&]:border-l [&+&]:border-line">
      <span className="text-[0.6875rem] uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <span className={cn("num text-lg font-semibold", flagged && "text-bp")}>
        {value}
        <small className="text-xs font-normal text-muted-foreground">{unit}</small>
        {flagged && <small className="ml-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em]">low</small>}
      </span>
      {children}
      <span className="text-[0.6875rem] text-muted-foreground">{note}</span>
    </div>
  );
}

function TrendsPanel({ latest }: { latest: { systolic: number; diastolic: number } }) {
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const tz = getDeviceTimezone();
  const [showWhy, setShowWhy] = useState(false);
  // Re-read the logical day every minute so an open panel rolls over at the
  // day boundary even when no new reading arrives.
  useNowTick();
  const today = logicalDayKey(Date.now(), dayStartHour, tz);
  const { start, end } = useMemo(
    () => ({
      start: logicalDayStart(shiftDayKey(today, -(TREND_DAYS - 1)), dayStartHour, tz),
      end: logicalDayStart(shiftDayKey(today, 1), dayStartHour, tz) - 1,
    }),
    [today, dayStartHour, tz],
  );
  const records = useBloodPressureRecordsInRange(start, end);
  const days: DailyDerivedBloodPressure[] = useMemo(
    () => (records ? dailyDerivedBloodPressure(records, { dayStartHour, tz }) : []),
    [records, dayStartHour, tz],
  );
  const now = deriveBloodPressure(latest.systolic, latest.diastolic);

  return (
    <div className="flex flex-col gap-2" data-testid="bp-derived-trends">
      <div className="grid grid-cols-3 border border-line bg-card">
        <Tile label="Pulse p." value={String(now.pulsePressure)} unit=" mmHg" note={`${TREND_DAYS}-day`}>
          <Sparkline values={days.map((d) => d.pulsePressure)} lo={20} hi={60} label="Pulse pressure, daily mean" />
        </Tile>
        <Tile
          label="PPP"
          value={String(Math.round(now.proportionalPulsePressure * 100))}
          unit="%"
          note="25% line"
          flagged={now.proportionalPulsePressure < PPP_LOW_THRESHOLD}
        >
          <Sparkline
            values={days.map((d) => d.proportionalPulsePressure * 100)}
            lo={20}
            hi={50}
            reference={PPP_LOW_THRESHOLD * 100}
            label="Proportional pulse pressure, daily mean"
          />
        </Tile>
        <Tile
          label="MAP"
          value={String(Math.round(now.meanArterialPressure))}
          unit=" mmHg"
          note={`${TREND_DAYS}-day`}
          flagged={now.meanArterialPressure < MAP_LOW_THRESHOLD}
        >
          <Sparkline values={days.map((d) => d.meanArterialPressure)} lo={65} hi={105} label="Mean arterial pressure, daily mean" />
        </Tile>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>From your last reading; lines are daily means</span>
        <button
          type="button"
          className="py-1 underline underline-offset-[3px]"
          aria-expanded={showWhy}
          onClick={() => setShowWhy((v) => !v)}
        >
          {showWhy ? "Hide explanation" : "What are these?"}
        </button>
      </div>
      {showWhy && (
        <p className="border-l-2 border-line pl-2.5 text-[0.8125rem] text-muted-foreground">
          PPP = (sys − dia) ÷ sys, a rough stroke-volume signal. Below 25% was linked to low cardiac output in
          advanced heart failure (Stevenson 1989). MAP here is calculated (dia + ⅓ pulse pressure), not the
          cuff&apos;s measured MAP. Use these as trends only, and read PPP next to heart rate.
        </p>
      )}
    </div>
  );
}

/**
 * Collapsible 14-day trends for the calculated BP metrics (pulse pressure,
 * proportional pulse pressure, MAP). Closed by default and costs one row;
 * the open state is remembered on this device.
 */
export function BloodPressureDerivedTrends({ latest }: { latest: { systolic: number; diastolic: number } | undefined }) {
  // Read after mount: the server render has no localStorage, and reading it
  // during render would mismatch on hydration.
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(readOpen()), []);
  if (!latest) return null;
  return (
    <>
      <SubToggle
        expanded={open}
        onToggle={() => {
          const next = !open;
          setOpen(next);
          writeOpen(next);
        }}
      >
        {TREND_DAYS}-day trends
        <span className="border border-line px-1 text-[0.625rem] font-normal tracking-[0.06em] text-muted-foreground">
          Calc
        </span>
      </SubToggle>
      {open && <TrendsPanel latest={latest} />}
    </>
  );
}
