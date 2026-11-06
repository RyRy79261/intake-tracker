"use client";

/** PROTOTYPE — throwaway. One daily chart used across the report chapters. */

import type { ReactNode } from "react";
import type { Day } from "@/components/analytics/insights-prototype/engine";
import { quantile } from "@/components/analytics/insights-prototype/engine";
import { col, fmtNum, mono, muted, shortDate } from "@/components/analytics/insights-prototype/ui";

const W = 600;

export function DayChart({
  days,
  get,
  kind,
  color,
  label,
  unit,
  refValue,
  refLabel,
  band,
  smooth,
  digits = 0,
  height = 64,
  marks = [],
}: {
  days: Day[];
  get: (d: Day) => number | undefined;
  kind: "dots" | "bars";
  color: string;
  label: string;
  unit: string;
  refValue?: number;
  refLabel?: string;
  band?: boolean;
  smooth?: boolean;
  digits?: number;
  height?: number;
  marks?: string[]; // day keys to draw a medication-change line at
}) {
  const H = height;
  const vals = days.map(get);
  const nums = vals.filter((v): v is number => v !== undefined);
  const p10 = quantile(nums, 0.1);
  const p90 = quantile(nums, 0.9);
  let lo = kind === "bars" ? 0 : Math.min(...nums, refValue ?? Infinity);
  let hi = Math.max(...nums, refValue ?? -Infinity);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (hi === lo) hi = lo + 1;
  const pad = kind === "bars" ? 0 : (hi - lo) * 0.1;
  const x = (i: number) => ((i + 0.5) / Math.max(1, days.length)) * W;
  const y = (v: number) => H - 2 - ((v - lo + pad) / (hi - lo + 2 * pad)) * (H - 4);
  const bw = (W / Math.max(1, days.length)) * 0.7;

  let line: ReactNode = null;
  if (smooth) {
    const pts: string[] = [];
    vals.forEach((_, i) => {
      const win = vals.slice(Math.max(0, i - 6), i + 1).filter((v): v is number => v !== undefined);
      if (win.length >= 3) pts.push(`${x(i)},${y(quantile(win, 0.5))}`);
    });
    if (pts.length > 1) line = <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />;
  }

  return (
    <figure style={{ margin: "8px 0 0" }}>
      <figcaption style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, lineHeight: "14px" }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ ...mono, ...muted, fontSize: 11 }}>
          {nums.length ? `most days ${fmtNum(p10, digits)}–${fmtNum(p90, digits)} ${unit}` : "no data"}
          {refValue !== undefined && refLabel ? ` · ${refLabel} ${fmtNum(refValue, digits)}` : ""}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block", background: "hsl(var(--fg) / .03)" }} role="img" aria-label={label}>
        {band && nums.length >= 7 && <rect x={0} width={W} y={y(p90)} height={Math.max(1, y(p10) - y(p90))} fill={color} opacity={0.1} />}
        {refValue !== undefined && <line x1={0} x2={W} y1={y(refValue)} y2={y(refValue)} stroke={col("muted-fg")} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        {marks.map((k) => {
          const i = days.findIndex((d) => d.key === k);
          return i < 0 ? null : <line key={k} x1={x(i)} x2={x(i)} y1={0} y2={H} stroke={col("meds")} strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={0.8} />;
        })}
        {vals.map((v, i) => {
          if (v === undefined) return null;
          const over = refValue !== undefined && kind === "bars" && v > refValue;
          return kind === "bars" ? (
            <rect key={i} x={x(i) - bw / 2} width={bw} y={y(v)} height={Math.max(0.5, H - 2 - y(v))} fill={color} opacity={refValue === undefined || over ? 0.95 : 0.5} />
          ) : (
            <line key={i} x1={x(i)} x2={x(i)} y1={y(v) - 2.5} y2={y(v) + 2.5} stroke={color} strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={smooth ? 0.45 : 0.9} />
          );
        })}
        {line}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", ...muted, ...mono, fontSize: 10, marginTop: 2 }}>
        <span>{days[0] ? shortDate(days[0].key) : ""}</span>
        <span>{days.length ? shortDate(days[days.length - 1]!.key) : ""}</span>
      </div>
    </figure>
  );
}

export function Table({ head, rows, align }: { head: string[]; rows: (string | ReactNode)[][]; align?: ("l" | "r")[] }) {
  return (
    <div style={{ overflowX: "auto", marginTop: 8 }}>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} style={{ ...muted, fontSize: 11, fontWeight: 500, textAlign: (align?.[i] ?? (i ? "r" : "l")) === "r" ? "right" : "left", padding: "0 0 4px", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, j) => (
            <tr key={j} style={{ borderTop: `1px solid ${col("line")}` }}>
              {r.map((c, i) => (
                <td key={i} style={{ padding: "4px 0", textAlign: (align?.[i] ?? (i ? "r" : "l")) === "r" ? "right" : "left", ...(i ? mono : {}), paddingLeft: i ? 8 : 0 }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SubHead({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 14, fontSize: 12, fontWeight: 600 }}>{children}</div>;
}
