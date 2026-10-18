"use client";

import { useMemo, type CSSProperties } from "react";
import { useDailyTotals } from "@/hooks/use-daily-totals";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { overTargetText, type MetricDay, type MetricKey } from "@intake/core/daily-totals";
import { domainColor, type Domain } from "@/lib/domain-colors";
import { openWindow } from "@/hooks/use-window-history";
import { useInPreview } from "@/lib/help/preview-context";
import { cn } from "@/lib/utils";
import type { FilterType } from "@/lib/history-types";
import { dayKeyWeekday, weekRangeLabel } from "@/lib/week-utils";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

interface Metric {
  key: MetricKey;
  label: string;
  unit: string;
  unitWord: string;
  color: string;
  /** Each day of the week against the target. */
  days: MetricDay[];
  fmt: (v: number) => string;
}

const fmtInt = (v: number) => Math.round(v).toLocaleString("en-US");
const fmtOne = (v: number) => (v === 0 ? "0" : (Math.round(v * 10) / 10).toFixed(1));

/**
 * "54 ml left" / "200 / 500 ml extra" / "▲ 1,001 / 500 ml extra".
 * Past the target it reads how far into the buffer the total is, against the
 * buffer's size, as on the Food card (`overTargetText`).
 */
function statusText(m: Metric, d: MetricDay): { short: string; long: string } {
  const u = m.unit;
  const amt = (v: number) => `${m.fmt(v)} ${u}`;
  if (d.status === "none") return { short: "no limit set", long: "no limit set" };
  if (d.soft) {
    return d.left === 0
      ? { short: "target met", long: "target met" }
      : { short: `${amt(d.left)} to go`, long: `${amt(d.left)} to reach the target` };
  }
  if (d.status === "ok") return { short: `${amt(d.left)} left`, long: `${amt(d.left)} left of the target` };
  const line = overTargetText(d, m.fmt, ` ${u}`);
  const where =
    d.buffer > 0
      ? `, ${d.status === "over" ? "past" : "inside"} the ${amt(d.buffer)} buffer`
      : "";
  return {
    short: d.status === "over" ? `▲ ${line}` : line,
    long: `${amt(d.overTarget)} over the target${where}`,
  };
}

/** Column scale: room for target + buffer, or the week's highest day. */
function scaleFor(m: Metric, visible: MetricDay[]): number {
  const max = Math.max(...visible.map((d) => d.value), 0);
  const t = m.days[0]!;
  return t.limit ? Math.max(t.limit + t.buffer, max) * 1.08 : Math.max(max, 0.1) * 1.12;
}

function DayCells({
  m,
  dayKeys,
  todayIndex,
  values = false,
}: {
  m: Metric;
  dayKeys: string[];
  todayIndex: number;
  /** Wide: each day's total under its column. */
  values?: boolean;
}) {
  const visible = m.days.slice(0, todayIndex + 1);
  const sc = scaleFor(m, visible);
  const limit = m.days[0]!.limit;
  const tick = limit ? `${((limit / sc) * 100).toFixed(1)}%` : null;
  return (
    <span className="wc-mc" aria-hidden="true">
      {dayKeys.map((key, i) => {
        const today = i === todayIndex;
        const future = i > todayIndex;
        const d = m.days[i]!;
        const v = d.value;
        const st = future ? null : d.status;
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
                  className={st === "extended" ? "h" : st === "over" ? "x" : undefined}
                  style={{ height: `${h.toFixed(1)}%` }}
                />
              )}
              {tick && <u style={{ bottom: tick }} />}
            </i>
            {values && <em>{future ? "—" : `${st === "over" ? "▲" : ""}${m.fmt(v)}`}</em>}
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
      const d = m.days[i]!;
      return `${day} ${m.fmt(d.value)}${d.status === "extended" ? " over target" : d.status === "over" ? " over limit" : ""}`;
    })
    .join(", ");
}

/** Today row -> the Records filter for its domain. */
const RECORDS_FILTER: Record<string, FilterType> = {
  water: "water",
  sodium: "salt",
  sugar: "sugar",
  potassium: "potassium",
  caffeine: "caffeine",
  alcohol: "alcohol",
};

/** Open Metrics › Records filtered to the row's domain. */
const openRecords = (key: string) => {
  openWindow("metrics", { tab: "records", filter: RECORDS_FILTER[key] ?? "all" });
};

/**
 * Home's Today gadget: one row per tracked metric with the week as seven mini
 * columns (today wider and outlined, the target as a tick, hatched when over
 * the target and solid when over the limit) and today's total with how much
 * is left. Caffeine and alcohol have no limit and sit side by side.
 * Reads the week with one range query per source.
 *
 * `wide` (Home on the desktop) has room for more: the day labels carry the
 * date, every day shows its total under its column, and caffeine and
 * alcohol get full rows like the rest.
 */
export function TodayGadget({ wide = false }: { wide?: boolean }) {
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");
  // In the manual's live preview a row stays put: Metrics would open over
  // the manual with the user's real records.
  const inPreview = useInPreview();
  const totals = useDailyTotals({ week: true });
  const { dayKeys, todayIndex } = totals;

  const metrics = useMemo(() => {
    const c = (d: Domain) => domainColor(d);
    const days = (k: MetricKey) => totals.metrics[k].days;
    const main: Metric[] = [
      { key: "water", label: "Water", unit: "ml", unitWord: "millilitres", color: c("water"), days: days("water"), fmt: fmtInt },
      { key: "sodium", label: "Sodium", unit: "mg", unitWord: "milligrams", color: c("sodium"), days: days("sodium"), fmt: fmtInt },
    ];
    if (sugarEnabled) {
      main.push({ key: "sugar", label: "Sugar", unit: "g", unitWord: "grams", color: c("sugar"), days: days("sugar"), fmt: fmtInt });
    }
    if (potassiumEnabled) {
      main.push({ key: "potassium", label: "Potassium", unit: "mg", unitWord: "milligrams", color: "hsl(var(--fg))", days: days("potassium"), fmt: fmtInt });
    }
    const pair: Metric[] = [
      { key: "caffeine", label: "Caffeine", unit: "mg", unitWord: "milligrams", color: c("caffeine"), days: days("caffeine"), fmt: fmtInt },
      { key: "alcohol", label: "Alcohol", unit: "std drinks", unitWord: "standard drinks", color: c("alcohol"), days: days("alcohol"), fmt: fmtOne },
    ];
    return { main, pair };
  }, [totals, sugarEnabled, potassiumEnabled]);

  return (
    <section
      className={cn("wc-gadget wc-today", wide && "wc-today-wide")}
      aria-label="Today"
      data-testid="today-gadget"
    >
      <div className="wc-ghead">
        <h2>Today</h2>
        <span className="wc-dl" aria-hidden="true">
          {dayKeys.map((key, i) => (
            <span key={key} className={cn(i === todayIndex && "t")} data-testid="today-day-label">
              {wide
                ? `${DAY_NAMES[dayKeyWeekday(key)]} ${Number(key.slice(8, 10))}`
                : DAY_NAMES[dayKeyWeekday(key)]!.slice(0, 1)}
            </span>
          ))}
        </span>
        <span className="wkr">week {weekRangeLabel(dayKeys)}</span>
      </div>

      <div className="wc-tg">
        {(wide ? [...metrics.main, ...metrics.pair] : metrics.main).map((m) => {
          const d = m.days[todayIndex]!;
          const v = d.value;
          const st = statusText(m, d);
          const aria = `${m.label} today ${m.fmt(v)}${d.limit ? ` of ${m.fmt(d.limit)}` : ""} ${m.unitWord}, ${st.long}. This week: ${weekAria(m, dayKeys, todayIndex)}. Open ${m.label} history`;
          return (
            <button
              key={m.key}
              type="button"
              className="wc-tg-row"
              style={{ "--c": m.color } as CSSProperties}
              aria-label={aria}
              data-testid={`today-row-${m.key}`}
              data-status={d.status}
              onClick={() => {
                if (!inPreview) openRecords(m.key);
              }}
            >
              <span className="wc-tg-l">{m.label}</span>
              <DayCells m={m} dayKeys={dayKeys} todayIndex={todayIndex} values={wide} />
              <span className="wc-tg-v">
                <span>
                  <b data-testid={`today-${m.key}-value`}>{m.fmt(v)}</b>
                  <span className="of">{d.limit ? ` / ${m.fmt(d.limit)}` : ` ${m.unit}`}</span>
                </span>
                {d.status === "over" ? (
                  <span className="wc-tg-s" data-testid={`today-${m.key}-status`}>
                    <span className="wc-inv">{st.short}</span>
                  </span>
                ) : (
                  <span
                    className={cn("wc-tg-s", d.status === "extended" && "over")}
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

      {!wide && (
        <div className="wc-tg-pair">
          {metrics.pair.map((m) => {
            const v = m.days[todayIndex]!.value;
            const aria = `${m.label} today ${m.fmt(v)} ${m.unitWord}, no limit set. This week: ${weekAria(m, dayKeys, todayIndex)}. Open ${m.label} history`;
            return (
              <button
                key={m.key}
                type="button"
                className="wc-tg-half"
                style={{ "--c": m.color } as CSSProperties}
                aria-label={aria}
                data-testid={`today-row-${m.key}`}
                onClick={() => {
                  if (!inPreview) openRecords(m.key);
                }}
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
      )}

      <p className="wc-tg-key">
        <span><i className="k-t" />today</span>
        <span><i className="k-tl" />target</span>
        <span><i className="k-h" />over target</span>
        <span><i className="k-x" />over limit</span>
        {!wide && <span>caffeine, alcohol: no limit</span>}
      </p>
    </section>
  );
}
