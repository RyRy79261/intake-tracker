"use client";

/**
 * PROTOTYPE — throwaway. Variant A: "What changed".
 * The last 7 days against your own previous 28: only what moved is up top,
 * then what happened (dose changes, journal), then the questions the app
 * keeps asking of your data.
 */

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { Insights } from "@/components/analytics/insights-prototype/engine";
import { ConfidenceChip, EngineState, Section, Spark, col, fmtNum, mono, muted, shortDate, signed } from "@/components/analytics/insights-prototype/ui";

export function VariantChanges({ data }: { data: Insights }) {
  const [showUsual, setShowUsual] = useState(false);
  const [showCollecting, setShowCollecting] = useState(false);
  const moved = data.baseline.filter((r) => r.status === "above" || r.status === "below");
  const usual = data.baseline.filter((r) => r.status === "usual");
  const thin = data.baseline.filter((r) => r.status === "too-little-data");
  const today = data.days[data.days.length - 1]!.key;
  const weekAgo = data.days[data.days.length - 8]!.key;
  const recentChanges = data.changes.filter((c) => c.date >= data.days[data.days.length - 15]!.key);
  const recentJournal = data.days.slice(-7).flatMap((d) => d.journal);
  const found = data.effects.filter((e) => e.confidence === "consistent" || e.confidence === "possible");
  const unclear = data.effects.filter((e) => e.confidence === "unclear");
  const collecting = data.effects.filter((e) => e.confidence === "too-little-data");

  return (
    <div className="wm-stack" style={{ paddingBottom: 120 }}>
      <p style={{ ...muted, padding: "0 2px" }}>
        {shortDate(weekAgo)} – {shortDate(data.days[data.days.length - 2]!.key)} compared with your previous 4 weeks.
        Typical range = the middle 80% of your own days.
      </p>

      {data.flags.length > 0 && (
        <Section title="Worth a look" color={col("destructive")}>
          <ul style={{ display: "grid", gap: 10, margin: 0, padding: 0, listStyle: "none" }}>
            {data.flags.slice(0, 5).map((f, i) => (
              <li key={i} style={{ display: "flex", gap: 8 }}>
                <AlertTriangle size={16} style={{ flex: "none", marginTop: 2, color: f.level === "red" ? col("destructive") : col("caffeine") }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {f.title} <span style={{ ...muted, fontWeight: 400 }}>· {shortDate(f.when)}</span>
                  </div>
                  <div style={muted}>{f.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={moved.length ? `${moved.length} things moved this week` : "Nothing moved outside your usual range"} color={col("ai")}>
        {moved.length === 0 && <p style={muted}>Every tracked measure with enough data sat inside your typical range.</p>}
        <div style={{ display: "grid", gap: 12 }}>
          {moved.map((r) => (
            <div key={r.metric.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {r.metric.label}{" "}
                  <span style={{ ...mono, color: r.status === "above" ? col("destructive") : col("water") }}>
                    {r.status === "above" ? "higher" : "lower"} {signed(r.delta, r.metric.digits ?? 0)} {r.metric.unit}
                  </span>
                </div>
                <div style={{ ...muted, ...mono }}>
                  this week {fmtNum(r.weekMedian, r.metric.digits ?? 0)} · usual {fmtNum(r.baseLo, r.metric.digits ?? 0)}–{fmtNum(r.baseHi, r.metric.digits ?? 0)} · {r.weekN}/{r.baseN} days
                </div>
              </div>
              <Spark values={r.spark} band={[r.baseLo, r.baseHi]} color={col(r.metric.domain)} />
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setShowUsual((v) => !v)} style={toggle}>
          {showUsual ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {usual.length} within your usual range
          {thin.length ? ` · ${thin.length} with too little data` : ""}
        </button>
        {showUsual && (
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <tbody>
              {[...usual, ...thin].map((r) => (
                <tr key={r.metric.id} style={{ borderTop: `1px solid ${col("line")}` }}>
                  <td style={{ padding: "4px 0" }}>{r.metric.label}</td>
                  <td style={{ ...mono, textAlign: "right" }}>
                    {r.status === "too-little-data" ? `${r.weekN} days logged` : `${fmtNum(r.weekMedian, r.metric.digits ?? 0)} ${r.metric.unit}`}
                  </td>
                  <td style={{ width: 90, paddingLeft: 8 }}>
                    <Spark values={r.spark} band={[r.baseLo, r.baseHi]} color={col(r.metric.domain)} width={84} height={18} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="What happened" color={col("meds")}>
        {recentChanges.length === 0 && recentJournal.length === 0 && <p style={muted}>No medication changes in 2 weeks and no journal entries this week.</p>}
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
          {recentChanges.map((c, i) => (
            <li key={`c${i}`} style={{ fontSize: 13 }}>
              <span style={{ ...mono, ...muted }}>{shortDate(c.date)}</span> <b>{c.medicine}</b> {c.what}
              <div style={muted}>
                Effects usually show after ~{c.lag} days ({c.lagWhy}). {c.date >= today ? "" : `Judge from ${shortDate(addDays(c.date, c.lag))}.`}
              </div>
            </li>
          ))}
          {recentJournal.map((j) => (
            <li key={j.id} style={{ fontSize: 13 }}>
              <span style={{ ...mono, ...muted }}>{new Date(j.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>{" "}
              <b style={{ color: col("journal") }}>{j.finding}</b>
              {j.severity !== null ? <span style={muted}> · severity {j.severity}/10</span> : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Questions your data is answering" color={col("ai")}>
        <p style={{ ...muted, marginTop: -4 }}>A fixed list, checked every day. Patterns, not proof: other things change on the same days.</p>
        <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
          {[...found, ...unclear].map((e) => (
            <div key={e.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, fontWeight: 600 }}>
                <span>{e.question}</span>
                <ConfidenceChip c={e.confidence} />
              </div>
              <div style={{ fontSize: 13 }}>{e.sentence}</div>
              <div style={{ ...muted, ...mono, fontSize: 11 }}>
                {e.nExposed} {e.exposure} days · {e.nOther} other days
              </div>
            </div>
          ))}
        </div>
        {collecting.length > 0 && (
          <>
            <button type="button" onClick={() => setShowCollecting((v) => !v)} style={toggle}>
              {showCollecting ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {collecting.length} still collecting data
            </button>
            {showCollecting &&
              collecting.map((e) => (
                <div key={e.id} style={{ fontSize: 12, marginTop: 6 }}>
                  <b>{e.question}</b> <span style={muted}>{e.sentence}</span>
                </div>
              ))}
          </>
        )}
      </Section>

      <EngineState counts={data.counts} days={data.days.length} />
    </div>
  );
}

function addDays(key: string, n: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const toggle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginTop: 12,
  padding: 0,
  background: "none",
  border: 0,
  color: col("muted-fg"),
  fontSize: 12,
  cursor: "pointer",
  minHeight: 32,
};
