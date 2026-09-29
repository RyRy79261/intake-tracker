"use client";

import { useMemo, type CSSProperties } from "react";
import { useIntakeRecordsByDateRange } from "@/hooks/use-intake-queries";
import { useSubstanceRecordsByDateRange } from "@/hooks/use-substance-queries";
import { useNowTick } from "@intake/ui/use-now-tick";
import { useSettingsStore } from "@/stores/settings-store";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { getProgressStatus } from "@intake/core/progress";
import { domainColor, type Domain } from "@/lib/domain-colors";
import { openWindow } from "@/hooks/use-window-history";
import { cn } from "@/lib/utils";
import {
  bucketByLogicalDay,
  dayKeyWeekday,
  getLogicalWeek,
  weekRangeLabel,
} from "@/lib/week-utils";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Where a day's total sits against its target and limit (target + buffer). */
export type DayStatus = "none" | "ok" | "over" | "lim";

interface Metric {
  key: string;
  label: string;
  unit: string;
  unitWord: string;
  color: string;
  values: number[];
  /** Daily target; 0 = no limit. */
  limit: number;
  /** Allowance past the target before it counts as over the limit. */
  buffer: number;
  /** A minimum to reach (potassium), never "over". */
  soft?: boolean;
  fmt: (v: number) => string;
}

const fmtInt = (v: number) => Math.round(v).toLocaleString("en-US");
const fmtOne = (v: number) => (v === 0 ? "0" : (Math.round(v * 10) / 10).toFixed(1));

export function dayStatus(value: number, limit: number, buffer: number, soft = false): DayStatus {
  if (!limit || soft) return limit ? "ok" : "none";
  const s = getProgressStatus(value, limit, buffer);
  return s === "over" ? "lim" : s === "extended" ? "over" : "ok";
}

/** "54 ml left" / "103 mg over target" / "▲ 20 mg over limit". */
function statusText(m: Metric, v: number): { short: string; long: string; status: DayStatus } {
  const status = dayStatus(v, m.limit, m.buffer, m.soft);
  const u = m.unit;
  if (status === "none") return { status, short: "no limit set", long: "no limit set" };
  if (m.soft) {
    return v >= m.limit
      ? { status, short: "target met", long: "target met" }
      : { status, short: `${m.fmt(m.limit - v)} ${u} to go`, long: `${m.fmt(m.limit - v)} ${u} to reach the target` };
  }
  if (status === "ok") {
    return { status, short: `${m.fmt(m.limit - v)} ${u} left`, long: `${m.fmt(m.limit - v)} ${u} left of the target` };
  }
  if (status === "over") {
    const t = `${m.fmt(v - m.limit)} ${u} over target`;
    return { status, short: t, long: t };
  }
  return {
    status,
    short: `▲ ${m.fmt(v - m.limit - m.buffer)} ${u} over limit`,
    long: `${m.fmt(v - m.limit - m.buffer)} ${u} over the limit, ${m.fmt(v - m.limit)} ${u} over target`,
  };
}

/** Column scale: room for target + buffer, or the week's highest day. */
function scaleFor(m: Metric, visible: number[]): number {
  const max = Math.max(...visible, 0);
  return m.limit ? Math.max(m.limit + m.buffer, max) * 1.08 : Math.max(max, 0.1) * 1.12;
}

function DayCells({ m, dayKeys, todayIndex }: { m: Metric; dayKeys: string[]; todayIndex: number }) {
  const visible = m.values.slice(0, todayIndex + 1);
  const sc = scaleFor(m, visible);
  const tick = m.limit ? `${((m.limit / sc) * 100).toFixed(1)}%` : null;
  return (
    <span className="wc-mc" aria-hidden="true">
      {dayKeys.map((key, i) => {
        const today = i === todayIndex;
        const future = i > todayIndex;
        const v = m.values[i] ?? 0;
        const st = future ? null : dayStatus(v, m.limit, m.buffer, m.soft);
        const h = !future && v > 0 ? Math.max(5, Math.min(100, (v / sc) * 100)) : 0;
        return (
          <span
            key={key}
            className={cn("wc-dc", today && "t", future && "fut")}
            data-testid={`today-cell-${m.key}`}
            data-day={key}
            data-status={future ? "future" : st}
          >
            <i>
              {h > 0 && (
                <b
                  className={st === "over" ? "h" : st === "lim" ? "x" : undefined}
                  style={{ height: `${h.toFixed(1)}%` }}
                />
              )}
              {tick && <u style={{ bottom: tick }} />}
            </i>
          </span>
        );
      })}
    </span>
  );
}

function weekAria(m: Metric, dayKeys: string[], todayIndex: number): string {
  return dayKeys
    .map((key, i) => {
      const day = DAY_NAMES[dayKeyWeekday(key)];
      if (i > todayIndex) return `${day} no data yet`;
      const v = m.values[i] ?? 0;
      const st = dayStatus(v, m.limit, m.buffer, m.soft);
      return `${day} ${m.fmt(v)}${st === "over" ? " over target" : st === "lim" ? " over limit" : ""}`;
    })
    .join(", ");
}

const openMetrics = () => {
  openWindow("metrics");
};

/**
 * Home's Today gadget: one row per tracked metric with the week as seven mini
 * columns (today wider and outlined, the target as a tick, hatched when over
 * the target and solid when over the limit) and today's total with how much
 * is left. Caffeine and alcohol have no limit and sit side by side.
 * Reads the week with one range query per source.
 */
export function TodayGadget() {
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const waterLimit = useSettingsStore((s) => s.waterLimit);
  const saltLimit = useSettingsStore((s) => s.saltLimit);
  const sugarLimit = useSettingsStore((s) => s.sugarLimit);
  const potassiumLimit = useSettingsStore((s) => s.potassiumLimit);
  const waterBuffer = useSettingsStore((s) => s.waterExtendedBuffer);
  const saltBuffer = useSettingsStore((s) => s.saltExtendedBuffer);
  const sugarBuffer = useSettingsStore((s) => s.sugarExtendedBuffer);
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");
  const tick = useNowTick();

  const week = useMemo(
    () => getLogicalWeek(new Date(), dayStartHour, weekStartsOn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayStartHour, weekStartsOn, tick],
  );
  const { start, end, dayKeys, todayIndex } = week;

  const intake = useIntakeRecordsByDateRange(start, end);
  const substances = useSubstanceRecordsByDateRange(start, end);

  const metrics = useMemo(() => {
    const byType = (type: string) =>
      bucketByLogicalDay(
        intake.filter((r) => r.type === type),
        dayKeys,
        dayStartHour,
        (r) => r.amount,
      );
    const caffeine = bucketByLogicalDay(
      substances.filter((r) => r.type === "caffeine"),
      dayKeys,
      dayStartHour,
      (r) => r.amountMg ?? 0,
    );
    const alcohol = bucketByLogicalDay(
      substances.filter((r) => r.type === "alcohol"),
      dayKeys,
      dayStartHour,
      (r) => r.amountStandardDrinks ?? 0,
    );
    const c = (d: Domain) => domainColor(d);
    const main: Metric[] = [
      { key: "water", label: "Water", unit: "ml", unitWord: "millilitres", color: c("water"), values: byType("water"), limit: waterLimit, buffer: waterBuffer, fmt: fmtInt },
      { key: "sodium", label: "Sodium", unit: "mg", unitWord: "milligrams", color: c("sodium"), values: byType("salt"), limit: saltLimit, buffer: saltBuffer, fmt: fmtInt },
    ];
    if (sugarEnabled) {
      main.push({ key: "sugar", label: "Sugar", unit: "g", unitWord: "grams", color: c("sugar"), values: byType("sugar"), limit: sugarLimit, buffer: sugarBuffer, fmt: fmtInt });
    }
    if (potassiumEnabled) {
      main.push({ key: "potassium", label: "Potassium", unit: "mg", unitWord: "milligrams", color: "hsl(var(--fg))", values: byType("potassium"), limit: potassiumLimit, buffer: 0, soft: true, fmt: fmtInt });
    }
    const pair: Metric[] = [
      { key: "caffeine", label: "Caffeine", unit: "mg", unitWord: "milligrams", color: c("caffeine"), values: caffeine, limit: 0, buffer: 0, fmt: fmtInt },
      { key: "alcohol", label: "Alcohol", unit: "std drinks", unitWord: "standard drinks", color: c("alcohol"), values: alcohol, limit: 0, buffer: 0, fmt: fmtOne },
    ];
    return { main, pair };
  }, [intake, substances, dayKeys, dayStartHour, waterLimit, waterBuffer, saltLimit, saltBuffer, sugarLimit, sugarBuffer, potassiumLimit, sugarEnabled, potassiumEnabled]);

  return (
    <section className="wc-gadget wc-today" aria-label="Today" data-testid="today-gadget">
      <div className="wc-ghead">
        <h2>Today</h2>
        <span className="wc-dl" aria-hidden="true">
          {dayKeys.map((key, i) => (
            <span key={key} className={cn(i === todayIndex && "t")} data-testid="today-day-label">
              {DAY_NAMES[dayKeyWeekday(key)]!.slice(0, 1)}
            </span>
          ))}
        </span>
        <span className="wkr">week {weekRangeLabel(dayKeys)}</span>
      </div>

      <div className="wc-tg">
        {metrics.main.map((m) => {
          const v = m.values[todayIndex] ?? 0;
          const st = statusText(m, v);
          const aria = `${m.label} today ${m.fmt(v)}${m.limit ? ` of ${m.fmt(m.limit)}` : ""} ${m.unitWord}, ${st.long}. This week: ${weekAria(m, dayKeys, todayIndex)}. Open ${m.label} history`;
          return (
            <button
              key={m.key}
              type="button"
              className="wc-tg-row"
              style={{ "--c": m.color } as CSSProperties}
              aria-label={aria}
              data-testid={`today-row-${m.key}`}
              data-status={st.status}
              onClick={openMetrics}
            >
              <span className="wc-tg-l">{m.label}</span>
              <DayCells m={m} dayKeys={dayKeys} todayIndex={todayIndex} />
              <span className="wc-tg-v">
                <span>
                  <b data-testid={`today-${m.key}-value`}>{m.fmt(v)}</b>
                  <span className="of">{m.limit ? ` / ${m.fmt(m.limit)}` : ` ${m.unit}`}</span>
                </span>
                {st.status === "lim" ? (
                  <span className="wc-tg-s" data-testid={`today-${m.key}-status`}>
                    <span className="wc-inv">{st.short}</span>
                  </span>
                ) : (
                  <span
                    className={cn("wc-tg-s", st.status === "over" && "over")}
                    data-testid={`today-${m.key}-status`}
                  >
                    {st.short}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="wc-tg-pair">
        {metrics.pair.map((m) => {
          const v = m.values[todayIndex] ?? 0;
          const aria = `${m.label} today ${m.fmt(v)} ${m.unitWord}, no limit set. This week: ${weekAria(m, dayKeys, todayIndex)}. Open ${m.label} history`;
          return (
            <button
              key={m.key}
              type="button"
              className="wc-tg-half"
              style={{ "--c": m.color } as CSSProperties}
              aria-label={aria}
              data-testid={`today-row-${m.key}`}
              onClick={openMetrics}
            >
              <span className="wc-tg-l">
                {m.label}
                <span className="wc-tg-hv">
                  <b data-testid={`today-${m.key}-value`}>{m.fmt(v)}</b> {m.unit}
                </span>
              </span>
              <DayCells m={m} dayKeys={dayKeys} todayIndex={todayIndex} />
            </button>
          );
        })}
      </div>

      <p className="wc-tg-key">
        <span><i className="k-t" />today</span>
        <span><i className="k-tl" />target</span>
        <span><i className="k-h" />over target</span>
        <span><i className="k-x" />over limit</span>
        <span>caffeine, alcohol: no limit</span>
      </p>
    </section>
  );
}
