"use client";

/**
 * PROTOTYPE — throwaway. Variant C: "Doctor report".
 * A fixed, standard one-pager (the AGP / home-BP report idea): nothing here is
 * "discovered", every block is always in the same place, and it prints.
 */

import { Printer } from "lucide-react";
import type { Insights } from "@/components/analytics/insights-prototype/engine";
import { EngineState, RangeBar, Section, col, fmtNum, mono, muted, pct, shortDate, signed } from "@/components/analytics/insights-prototype/ui";

const BLOCKS = ["00", "03", "06", "09", "12", "15", "18", "21"];

export function VariantReport({ data, printable = true }: { data: Insights; printable?: boolean }) {
  const { bp, weight, water, sodium, adherence: adh, alcohol } = data;
  const end = data.days[data.days.length - 2]!.key;
  const start = data.days[Math.max(0, data.days.length - 1 - data.period)]!.key;
  const questions = buildQuestions(data);

  return (
    <div className="wm-stack" style={{ paddingBottom: 120 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Report for your care team</div>
          <div style={{ ...muted, ...mono }}>
            {shortDate(start)} – {shortDate(end)} · {data.period} days
          </div>
        </div>
        {printable && <button type="button" onClick={() => window.print()} className="wm-ibtn" data-print-hide style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 10px", minHeight: 36, border: `1px solid ${col("line")}`, background: "transparent", fontSize: 13 }}>
          <Printer size={14} /> Print
        </button>}
      </div>

      {data.flags.length > 0 && (
        <Section title="Warning signs in the last 2 weeks" color={col("destructive")}>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
            {data.flags.slice(0, 6).map((f, i) => (
              <li key={i}>
                <b>{f.title}</b> <span style={muted}>({shortDate(f.when)})</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="1 · Home blood pressure" color={col("bp")}>
        <div style={grid3}>
          <Stat label="Last 7 days, average" value={`${fmtNum(bp.sys)}/${fmtNum(bp.dia)}`} unit="mmHg" sub={`${bp.n} readings · ${bp.amN} AM · ${bp.pmN} PM`} />
          <Stat label="Heart rate" value={fmtNum(bp.hr)} unit="bpm" sub="same readings" />
          <Stat label="Day-to-day swing" value={fmtNum(bp.arv, 1)} unit="mmHg" sub="avg change between readings" />
        </div>
        {!bp.meetsProtocol && (
          <p style={{ ...muted, marginTop: 8 }}>
            Guideline home monitoring uses morning <i>and</i> evening readings for 7 days (at least 12). This week has {bp.amN} morning and {bp.pmN} evening, so
            the average above is morning-weighted.
          </p>
        )}
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Readings by band, {data.period} days ({bp.tirN})</div>
        <RangeBar
          parts={[
            { label: "Systolic < 100", n: bp.tir.low, color: col("water") },
            { label: "100 – 134 / < 85", n: bp.tir.in, color: "hsl(var(--fg) / .25)" },
            { label: "≥ 135 or ≥ 85", n: bp.tir.high, color: col("bp") },
          ]}
        />
        <p style={{ ...muted, marginTop: 6 }}>
          Most readings systolic {fmtNum(bp.sysP10)}–{fmtNum(bp.sysP90)} · {bp.standingN ? `${bp.standingN} standing readings` : "no standing readings, so a drop on standing can't be checked"}.
          Bands use the ESH home threshold (135/85); your own target may differ.
        </p>
      </Section>

      <Section title="2 · Weight" color={col("weight")}>
        <div style={grid3}>
          <Stat label="Last 7 days (median)" value={fmtNum(weight.m7, 1)} unit="kg" />
          <Stat label="vs 4 weeks before" value={signed(weight.m7 - weight.prev, 1)} unit="kg" />
          <Stat
            label="Trend, last 4 weeks"
            value={weight.enough ? signed(weight.slope, 2) : "—"}
            unit="kg/wk"
            sub={weight.enough ? (weight.lo! <= 0 && weight.hi! >= 0 ? "flat within noise" : `likely ${signed(weight.lo!, 2)} to ${signed(weight.hi!, 2)}`) : `${weight.n} weigh-ins, need 10`}
          />
        </div>
      </Section>

      <Section title="3 · Fluid and sodium" color={col("water")}>
        <div style={grid3}>
          <Stat label="Days within fluid limit" value={pct(water.p)} sub={`${water.within}/${water.n} logged days · limit ${fmtNum(data.limits.water)} ml`} />
          <Stat label="Fluid, typical day" value={fmtNum(water.median)} unit="ml" sub={`most days ${fmtNum(water.p10)}–${fmtNum(water.p90)}`} />
          <Stat label="Over by (median)" value={Number.isFinite(water.medianOver) ? fmtNum(water.medianOver) : "—"} unit="ml" sub="on days over" />
          <Stat label="Days within sodium limit" value={pct(sodium.p)} sub={`${sodium.within}/${sodium.n} · limit ${fmtNum(data.limits.sodium)} mg`} />
          <Stat label="Sodium, typical day" value={fmtNum(sodium.median)} unit="mg" sub={`most days ${fmtNum(sodium.p10)}–${fmtNum(sodium.p90)}`} />
          <Stat label="Fluid after 18:00" value={pct(data.fluidClock.slice(6).reduce((s, v) => s + v, 0))} sub="share of the day's fluid" />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>When fluid and sodium come in (share by time of day)</div>
        <Clock rows={[{ label: "Fluid", v: data.fluidClock, c: col("water") }, { label: "Sodium", v: data.sodiumClock, c: col("sodium") }]} />
        {data.sodiumSources.length > 0 && (
          <>
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Biggest sodium sources</div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <tbody>
                {data.sodiumSources.map((s) => (
                  <tr key={s.label} style={{ borderTop: `1px solid ${col("line")}` }}>
                    <td style={{ padding: "3px 0", textTransform: "capitalize" }}>{s.label}</td>
                    <td style={{ ...mono, textAlign: "right" }}>{fmtNum(s.mg)} mg</td>
                    <td style={{ ...mono, textAlign: "right", width: 48 }}>{pct(s.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

      <Section title="4 · Alcohol" color={col("alcohol")}>
        <div style={grid3}>
          <Stat label={`Drinking days, ${data.period} days`} value={`${alcohol.drinkDays}/${alcohol.n}`} />
          <Stat label="Per week" value={fmtNum(alcohol.perWeek, 1)} unit="std drinks" />
          <Stat label="Days with 5+" value={String(alcohol.heavyDays)} sub={`most in a day ${fmtNum(alcohol.maxDay, 1)}`} />
        </div>
        {data.effects
          .filter((e) => e.id.startsWith("alc") && e.confidence !== "too-little-data")
          .map((e) => (
            <p key={e.id} style={{ fontSize: 13, marginTop: 8 }}>
              {e.sentence} <span style={muted}>({e.nExposed} vs {e.nOther} days)</span>
            </p>
          ))}
      </Section>

      <Section title="5 · Medicines" color={col("meds")}>
        <div style={grid3}>
          <Stat label="Doses taken" value={pct(adh.taken / adh.due)} sub={`${adh.taken}/${adh.due} scheduled`} />
          <Stat label="Days fully covered" value={pct(adh.fullDays / adh.days)} sub={`${adh.fullDays}/${adh.days} days`} />
          <Stat label="Within 60 min of time" value={pct(adh.onTime / adh.taken)} sub={`median ${signed(adh.medianDelay)} min`} />
        </div>
        {adh.slots.length > 0 && (
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginTop: 8 }}>
            <thead>
              <tr style={muted}>
                <th style={{ textAlign: "left", fontWeight: 500 }}>Slot</th>
                <th style={{ textAlign: "right", fontWeight: 500 }}>Typical delay</th>
                <th style={{ textAlign: "right", fontWeight: 500 }}>Worst 1 in 10</th>
              </tr>
            </thead>
            <tbody>
              {adh.slots.map((s) => (
                <tr key={s.time} style={{ borderTop: `1px solid ${col("line")}`, ...mono }}>
                  <td style={{ padding: "3px 0" }}>{s.time}</td>
                  <td style={{ textAlign: "right" }}>{signed(s.median)} min</td>
                  <td style={{ textAlign: "right" }}>{signed(s.p90)} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data.changes.length > 0 && (
          <>
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Medicine changes</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
              {data.changes.slice(0, 8).map((c, i) => (
                <li key={i}>
                  <span style={mono}>{shortDate(c.date)}</span> {c.medicine}: {c.what}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="6 · Symptoms and what came before" color={col("journal")}>
        {data.symptoms.entries.length === 0 && <p style={muted}>No symptoms or signs in the journal in this period.</p>}
        {data.symptoms.patterns.map((p) => (
          <p key={p.finding} style={{ fontSize: 13 }}>
            <b>{p.finding}</b> ×{p.n}: {p.text}.
          </p>
        ))}
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
          {data.symptoms.entries.slice(0, 8).map((s) => (
            <li key={s.entry.id} style={{ fontSize: 12, borderTop: `1px solid ${col("line")}`, paddingTop: 4 }}>
              <b>{s.entry.finding}</b>{" "}
              <span style={{ ...muted, ...mono }}>
                {new Date(s.entry.timestamp).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {s.entry.severity !== null ? ` · ${s.entry.severity}/10` : ""}
              </span>
              <div style={muted}>
                {[
                  s.lastBp && `BP ${s.lastBp.sys}/${s.lastBp.dia}${s.lastBp.hr ? ` HR ${s.lastBp.hr}` : ""} ${fmtNum(s.lastBp.hoursBefore)} h before`,
                  s.hoursSinceDose && `${fmtNum(s.hoursSinceDose.h, 1)} h after ${s.hoursSinceDose.name}`,
                  s.weightVsUsual !== undefined && `weight ${signed(s.weightVsUsual, 1)} kg vs usual`,
                  s.alcohol24h > 0 && `${fmtNum(s.alcohol24h, 1)} drinks in prior 24 h`,
                  s.sodiumDayBefore !== undefined && `${fmtNum(s.sodiumDayBefore)} mg sodium day before`,
                  ...s.lateOrMissed24h,
                ]
                  .filter(Boolean)
                  .join(" · ") || "nothing else logged nearby"}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {questions.length > 0 && (
        <Section title="Things to ask about" color={col("ai")}>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, display: "grid", gap: 4 }}>
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p style={{ ...muted, marginTop: 6 }}>Generated from fixed rules on your numbers, not medical advice.</p>
        </Section>
      )}

      <EngineState counts={data.counts} days={data.days.length} />
    </div>
  );
}

export function buildQuestions(d: Insights): string[] {
  const q: string[] = [];
  if (!d.bp.meetsProtocol) q.push("Should I add evening blood pressure readings, so the home average follows the standard protocol?");
  if (d.bp.tir.low / Math.max(1, d.bp.tirN) >= 0.2) q.push("A fifth or more of my readings are under 100 systolic. Is that low enough to matter?");
  if (d.sodium.p < 0.5) q.push(`I'm under my sodium limit on ${pct(d.sodium.p)} of days. Is ${fmtNum(d.limits.sodium)} mg the right limit, and where should I cut?`);
  if (d.water.p < 0.5) q.push(`I'm within my fluid limit on ${pct(d.water.p)} of days. Is ${fmtNum(d.limits.water)} ml still the right limit for me?`);
  if (d.alcohol.heavyDays > 0) q.push(`I had ${d.alcohol.heavyDays} days with 5+ drinks in ${d.period} days. How does alcohol interact with my medicines and heart?`);
  if (Number.isFinite(d.adherence.p90Delay) && d.adherence.p90Delay > 90) q.push("Some doses are taken 1.5 h or more late. How much does timing matter for each of my medicines?");
  for (const f of d.flags.filter((f) => f.level === "red").slice(0, 1)) q.push(`About the ${f.title.toLowerCase()} on ${shortDate(f.when)}.`);
  return q;
}

export function Stat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div>
      <div style={{ ...muted, fontSize: 11 }}>{label}</div>
      <div style={{ ...mono, fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>
        {value}
        {unit && <small style={{ fontSize: 11, fontWeight: 400 }}> {unit}</small>}
      </div>
      {sub && <div style={{ ...muted, fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

export function Clock({ rows }: { rows: { label: string; v: number[]; c: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "52px repeat(8, 1fr)", gap: 2, alignItems: "end", fontSize: 10 }}>
      {rows.map((r) => [
        <span key={`${r.label}l`} style={{ ...muted, fontSize: 11, alignSelf: "center" }}>
          {r.label}
        </span>,
        ...r.v.map((v, i) => (
          <div key={`${r.label}${i}`} title={`${BLOCKS[i]}:00 ${pct(v)}`} style={{ height: 28, display: "flex", alignItems: "flex-end", background: "hsl(var(--fg) / .03)" }}>
            <div style={{ width: "100%", height: `${Math.max(2, v * 100 * 1.6)}%`, maxHeight: "100%", background: r.c, opacity: 0.8 }} />
          </div>
        )),
      ])}
      <span />
      {BLOCKS.map((b) => (
        <span key={b} style={{ ...muted, ...mono, fontSize: 10, textAlign: "center" }}>
          {b}
        </span>
      ))}
    </div>
  );
}

export const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px 12px" };
