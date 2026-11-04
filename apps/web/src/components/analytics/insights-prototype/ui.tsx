"use client";

/** PROTOTYPE — throwaway. Small shared bits for the insight variants. */

import type { CSSProperties, ReactNode } from "react";
import type { Confidence } from "@/components/analytics/insights-prototype/engine";

export const col = (v: string) => `hsl(var(--${v}))`;

export function fmtNum(v: number, digits = 0) {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
export function signed(v: number, digits = 0) {
  if (!Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmtNum(Math.abs(v), digits)}`;
}
export function pct(v: number) {
  return Number.isFinite(v) ? `${Math.round(v * 100)}%` : "—";
}
export function shortDate(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

const CONF: Record<Confidence, { label: string; bg: string; fg: string }> = {
  consistent: { label: "Consistent", bg: "hsl(var(--water) / .18)", fg: col("fg") },
  possible: { label: "Possible", bg: "hsl(var(--caffeine) / .2)", fg: col("fg") },
  unclear: { label: "No clear effect", bg: "hsl(var(--line))", fg: col("muted-fg") },
  "too-little-data": { label: "Collecting", bg: "transparent", fg: col("muted-fg") },
};

export function ConfidenceChip({ c }: { c: Confidence }) {
  const s = CONF[c];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        background: s.bg,
        color: s.fg,
        border: `1px solid ${c === "too-little-data" ? col("line") : "transparent"}`,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

/** Tiny line of the last N daily values, with an optional shaded band. */
export function Spark({
  values,
  band,
  color,
  width = 120,
  height = 28,
  highlightLast = 7,
}: {
  values: (number | undefined)[];
  band?: [number, number];
  color: string;
  width?: number;
  height?: number;
  highlightLast?: number;
}) {
  const nums = values.filter((v): v is number => v !== undefined && Number.isFinite(v));
  if (nums.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  let lo = Math.min(...nums, band?.[0] ?? Infinity);
  let hi = Math.max(...nums, band?.[1] ?? -Infinity);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - lo) / (hi - lo)) * (height - 6);
  const cut = values.length - highlightLast;
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      {band && Number.isFinite(band[0]) && (
        <rect x={0} width={width} y={y(band[1])} height={Math.max(1, y(band[0]) - y(band[1]))} fill={color} opacity={0.12} />
      )}
      <rect x={x(cut) - 1} width={width - x(cut) + 1} y={0} height={height} fill={col("fg")} opacity={0.04} />
      {values.map((v, i) =>
        v === undefined || !Number.isFinite(v) ? null : (
          <circle key={i} cx={x(i)} cy={y(v)} r={i >= cut ? 2.2 : 1.4} fill={color} opacity={i >= cut ? 1 : 0.55} />
        ),
      )}
    </svg>
  );
}

export function Section({ title, color, children, aside }: { title: ReactNode; color?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="wm-card" style={{ "--c": color ?? col("line") } as CSSProperties}>
      <h3 className="wm-ct" style={{ justifyContent: "space-between" }}>
        <span>{title}</span>
        {aside}
      </h3>
      {children}
    </section>
  );
}

export const mono: CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
export const muted: CSSProperties = { color: col("muted-fg"), fontSize: 12, lineHeight: 1.4 };

/** Stacked bar: below / in / above, with counts. */
export function RangeBar({ parts }: { parts: { label: string; n: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 14, border: `1px solid ${col("line")}` }}>
        {parts.map((p) =>
          p.n ? <div key={p.label} title={`${p.label}: ${p.n}`} style={{ width: `${(100 * p.n) / total}%`, background: p.color }} /> : null,
        )}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap", ...muted }}>
        {parts.map((p) => (
          <span key={p.label}>
            <span style={{ display: "inline-block", width: 8, height: 8, background: p.color, marginRight: 4 }} />
            {p.label} <b style={mono}>{Math.round((100 * p.n) / total)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Footer that surfaces what the engine ran on (prototype rule: show the state). */
export function EngineState({ counts, days }: { counts: Record<string, number>; days: number }) {
  return (
    <p style={{ ...muted, ...mono, fontSize: 11, padding: "0 2px" }} data-print-hide>
      PROTOTYPE · engine ran on {days} logical days ·{" "}
      {Object.entries(counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(" · ")}
    </p>
  );
}
