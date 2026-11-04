"use client";

/**
 * PROTOTYPE — throwaway. Variant B: "Annotated timeline".
 * Every measure on one shared 60-day axis, medication changes as lines through
 * all lanes, journal entries as pins. Tap a day to see everything for it.
 * Under it, a before/after card for each medication change.
 */

import { useState, type ReactNode } from "react";
import type { Day, Insights } from "@/components/analytics/insights-prototype/engine";
import { quantile } from "@/components/analytics/insights-prototype/engine";
import { ConfidenceChip, EngineState, Section, col, fmtNum, mono, muted, shortDate, signed } from "@/components/analytics/insights-prototype/ui";

const N = 60;
const W = 600;

interface Lane {
  id: string;
  label: string;
  unit: string;
  color: string;
  get: (d: Day) => number | undefined;
  kind: "dots" | "bars";
  ref?: number; // horizontal reference (limit / threshold)
  refLabel?: string;
  band?: boolean; // shade your own P10–P90
  smooth?: boolean; // 7-day rolling median line
  digits?: number;
}

export function VariantTimeline({ data }: { data: Insights }) {
  const days = data.days.slice(-N);
  const [sel, setSel] = useState<number>(days.length - 2);
  const changes = data.changes.filter((c) => c.date >= days[0]!.key);
  const idxOf = (key: string) => days.findIndex((d) => d.key === key);

  const lanes: Lane[] = [
    { id: "sys", label: "Morning systolic", unit: "mmHg", color: col("bp"), get: (d) => d.amSys, kind: "dots", ref: 135, refLabel: "135", band: true },
    { id: "hr", label: "Morning heart rate", unit: "bpm", color: col("bp"), get: (d) => d.amHr, kind: "dots", band: true },
    { id: "wt", label: "Weight", unit: "kg", color: col("weight"), get: (d) => d.weight, kind: "dots", smooth: true, digits: 1 },
    { id: "water", label: "Fluid", unit: "ml", color: col("water"), get: (d) => d.water, kind: "bars", ref: data.limits.water, refLabel: "limit" },
    { id: "na", label: "Sodium", unit: "mg", color: col("sodium"), get: (d) => d.sodium, kind: "bars", ref: data.limits.sodium, refLabel: "limit" },
    { id: "alc", label: "Alcohol", unit: "drinks", color: col("alcohol"), get: (d) => (d.water !== undefined ? d.alcohol ?? 0 : undefined), kind: "bars", digits: 1 },
    { id: "ur", label: "Urinations", unit: "/day", color: col("water"), get: (d) => d.urination, kind: "bars" },
    { id: "dose", label: "Doses on time", unit: "%", color: col("meds"), get: (d) => (d.dosesDue ? (100 * d.dosesOnTime) / d.dosesDue : undefined), kind: "bars", ref: 100 },
  ];

  const x = (i: number) => ((i + 0.5) / days.length) * W;
  const day = days[sel];

  return (
    <div className="wm-stack" style={{ paddingBottom: 120 }}>
      <Section title={`Last ${N} days`} color={col("ai")} aside={<span style={muted}>tap a day</span>}>
        {/* journal pins + change labels */}
        <div style={{ position: "relative", height: 22, marginBottom: 2 }}>
          {changes.map((c, i) => {
            const k = idxOf(c.date);
            return k < 0 ? null : (
              <span key={`c${i}`} title={`${c.medicine}: ${c.what}`} style={{ position: "absolute", left: `${(100 * (k + 0.5)) / days.length}%`, transform: "translateX(-50%)", fontSize: 10, color: col("meds"), fontWeight: 700 }}>
                ℞
              </span>
            );
          })}
          {days.map((d, i) =>
            d.journal.length ? (
              <span key={d.key} title={d.journal.map((j) => j.finding).join(", ")} style={{ position: "absolute", top: 10, left: `${(100 * (i + 0.5)) / days.length}%`, transform: "translateX(-50%)", width: 7, height: 7, borderRadius: 99, background: col("journal") }} />
            ) : null,
          )}
        </div>

        <div style={{ position: "relative" }}>
          {lanes.map((l) => (
            <LaneRow key={l.id} lane={l} days={days} x={x} changes={changes.map((c) => idxOf(c.date)).filter((k) => k >= 0)} sel={sel} />
          ))}
          {/* click/hover capture */}
          <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
            {days.map((d, i) => (
              <button
                key={d.key}
                type="button"
                aria-label={shortDate(d.key)}
                onClick={() => setSel(i)}
                onPointerEnter={(e) => e.pointerType === "mouse" && setSel(i)}
                style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
              />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", ...muted, ...mono, fontSize: 11, marginTop: 4 }}>
          <span>{shortDate(days[0]!.key)}</span>
          <span>{shortDate(days[Math.floor(days.length / 2)]!.key)}</span>
          <span>today</span>
        </div>
      </Section>

      {day && (
        <Section title={new Date(`${day.key}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} color={col("fg")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "6px 12px", fontSize: 13 }}>
            {lanes.map((l) => {
              const v = l.get(day);
              return (
                <div key={l.id}>
                  <div style={muted}>{l.label}</div>
                  <div style={mono}>
                    {v === undefined ? "—" : `${fmtNum(v, l.digits ?? 0)} ${l.unit}`}
                  </div>
                </div>
              );
            })}
          </div>
          {day.journal.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              {day.journal.map((j) => (
                <div key={j.id}>
                  <b style={{ color: col("journal") }}>{j.finding}</b> <span style={muted}>{j.words}</span>
                </div>
              ))}
            </div>
          )}
          {changes.filter((c) => c.date === day.key).map((c, i) => (
            <div key={i} style={{ marginTop: 6, fontSize: 13 }}>
              <b style={{ color: col("meds") }}>{c.medicine}</b> {c.what}
            </div>
          ))}
        </Section>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 600, margin: "4px 2px 0" }}>Did each change do anything?</h3>
      {data.changes.length === 0 && <p style={muted}>No medication changes recorded.</p>}
      {data.changes.slice(0, 8).map((c, i) => (
        <Section
          key={i}
          color={col("meds")}
          title={
            <span>
              <span style={{ ...mono, ...muted }}>{shortDate(c.date)}</span> {c.medicine}
            </span>
          }
        >
          <p style={{ ...muted, marginTop: -6 }}>
            {c.what}. 4 weeks before vs 4 weeks starting {c.lag} days after ({c.lagWhy}).
          </p>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", marginTop: 6 }}>
            <tbody>
              {c.responses.map((r) => (
                <tr key={r.label} style={{ borderTop: `1px solid ${col("line")}` }}>
                  <td style={{ padding: "5px 0" }}>{r.label}</td>
                  <td style={{ ...mono, textAlign: "right" }}>
                    {r.afterNeedsUntil
                      ? `wait until ${shortDate(r.afterNeedsUntil)}`
                      : r.confidence === "too-little-data"
                        ? `${r.nBefore} / ${r.nAfter} days`
                        : `${signed(r.est, r.unit === "kg" ? 1 : 0)} ${r.unit}`}
                  </td>
                  <td style={{ textAlign: "right", paddingLeft: 8, width: 1 }}>
                    <ConfidenceChip c={r.afterNeedsUntil ? "too-little-data" : r.confidence} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(c.overlaps.length > 0 || c.caveat) && (
            <p style={{ ...muted, marginTop: 6 }}>
              {c.overlaps.length > 0 && <>Other changes within 2 weeks ({c.overlaps.slice(0, 3).join(", ")}{c.overlaps.length > 3 ? "…" : ""}) — their effects can't be separated. </>}
              {c.caveat}
            </p>
          )}
        </Section>
      ))}

      <EngineState counts={data.counts} days={data.days.length} />
    </div>
  );
}

function LaneRow({ lane, days, x, changes, sel }: { lane: Lane; days: Day[]; x: (i: number) => number; changes: number[]; sel: number }) {
  const H = 44;
  const vals = days.map(lane.get);
  const nums = vals.filter((v): v is number => v !== undefined);
  const p10 = quantile(nums, 0.1);
  const p90 = quantile(nums, 0.9);
  let lo = lane.kind === "bars" ? 0 : Math.min(...nums, lane.ref ?? Infinity);
  let hi = Math.max(...nums, lane.ref ?? -Infinity);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (hi === lo) hi = lo + 1;
  const pad = lane.kind === "bars" ? 0 : (hi - lo) * 0.1;
  const y = (v: number) => H - 2 - ((v - lo + pad) / (hi - lo + 2 * pad)) * (H - 4);
  const bw = (W / days.length) * 0.7;

  let smoothPath: ReactNode = null;
  if (lane.smooth) {
    const pts: string[] = [];
    vals.forEach((_, i) => {
      const win = vals.slice(Math.max(0, i - 6), i + 1).filter((v): v is number => v !== undefined);
      if (win.length >= 3) pts.push(`${x(i)},${y(quantile(win, 0.5))}`);
    });
    if (pts.length > 1) smoothPath = <polyline points={pts.join(" ")} fill="none" stroke={lane.color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
  }

  const latest = [...vals].reverse().find((v) => v !== undefined);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, lineHeight: "14px" }}>
        <span style={{ fontWeight: 600 }}>{lane.label}</span>
        <span style={{ ...mono, ...muted, fontSize: 11 }}>
          {nums.length ? `usual ${fmtNum(p10, lane.digits ?? 0)}–${fmtNum(p90, lane.digits ?? 0)}` : "no data"}
          {latest !== undefined ? ` · latest ${fmtNum(latest, lane.digits ?? 0)} ${lane.unit}` : ""}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block", background: "hsl(var(--fg) / .025)" }} aria-hidden="true">
        <rect x={x(sel) - W / days.length / 2} width={W / days.length} y={0} height={H} fill={col("fg")} opacity={0.08} />
        {lane.band && nums.length >= 10 && <rect x={0} width={W} y={y(p90)} height={Math.max(1, y(p10) - y(p90))} fill={lane.color} opacity={0.1} />}
        {lane.ref !== undefined && <line x1={0} x2={W} y1={y(lane.ref)} y2={y(lane.ref)} stroke={col("muted-fg")} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" strokeWidth={1} />}
        {changes.map((k) => (
          <line key={k} x1={x(k)} x2={x(k)} y1={0} y2={H} stroke={col("meds")} strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={0.7} />
        ))}
        {vals.map((v, i) => {
          if (v === undefined) return null;
          const over = lane.ref !== undefined && lane.kind === "bars" && lane.id !== "dose" && v > lane.ref;
          return lane.kind === "bars" ? (
            <rect key={i} x={x(i) - bw / 2} width={bw} y={y(v)} height={Math.max(0.5, H - 2 - y(v))} fill={lane.color} opacity={over ? 1 : 0.55} />
          ) : (
            <line key={i} x1={x(i)} x2={x(i)} y1={y(v) - 2.5} y2={y(v) + 2.5} stroke={lane.color} strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={lane.smooth ? 0.45 : 0.9} />
          );
        })}
        {smoothPath}
      </svg>
    </div>
  );
}
