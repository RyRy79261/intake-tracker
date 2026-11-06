"use client";

/**
 * PROTOTYPE — throwaway. The doctor-report chapters for the whole Metrics
 * window: Vitals, Intake, Medicines, Journal. Every block is fixed (nothing
 * "discovered"), covers the period picked in the range selector, and states
 * how many days or readings it rests on.
 */

import type { ReactNode } from "react";
import type { ChangeEvent, Effect, Insights } from "@/components/analytics/insights-prototype/engine";
import { DayChart, SubHead, Table } from "@/components/analytics/insights-prototype/charts";
import { ConfidenceChip, RangeBar, Section, col, fmtNum, muted, pct, shortDate, signed } from "@/components/analytics/insights-prototype/ui";
import { Clock, Stat, grid3 } from "@/components/analytics/insights-prototype/variant-report";

const when = (ts: number) => new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function EffectRow({ e }: { e: Effect }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, fontWeight: 600 }}>
        <span>{e.question}</span>
        <ConfidenceChip c={e.confidence} />
      </div>
      <div style={{ fontSize: 12 }}>{e.sentence}</div>
      {e.confidence !== "too-little-data" && (
        <div style={{ ...muted, fontSize: 11 }}>
          {e.nExposed} {e.exposure} days · {e.nOther} other days · pattern, not proof
        </div>
      )}
    </div>
  );
}

const effects = (d: Insights, ids: string[]) => d.effects.filter((e) => ids.includes(e.id));
const changeMarks = (d: Insights) => d.changes.map((c) => c.date);

// ---------------------------------------------------------------------------

export function VitalsChapter({ data: d }: { data: Insights }) {
  const { bp, weight } = d;
  const days = d.inPeriod;
  return (
    <>
      <Section title="Blood pressure and heart rate" color={col("bp")}>
        <div style={grid3}>
          <Stat label="Home average, last 7 days" value={`${fmtNum(bp.sys)}/${fmtNum(bp.dia)}`} unit="mmHg" sub={`${bp.amN} morning · ${bp.pmN} evening readings`} />
          <Stat label="Heart rate" value={fmtNum(bp.hr)} unit="bpm" sub={`most readings ${fmtNum(bp.hrP10)}–${fmtNum(bp.hrP90)}`} />
          <Stat label="Pulse pressure" value={fmtNum(bp.pulsePressure)} unit="mmHg" sub={`MAP ${fmtNum(bp.map)} mmHg`} />
        </div>
        {!bp.meetsProtocol && (
          <p style={{ ...muted, marginTop: 8 }}>
            The standard home protocol is morning and evening readings for 7 days. With {bp.pmN} evening readings this average is morning-only.
          </p>
        )}
        <DayChart days={days} get={(x) => x.amSys} kind="dots" color={col("bp")} label="Morning systolic" unit="mmHg" refValue={135} refLabel="home threshold" band marks={changeMarks(d)} />
        <DayChart days={days} get={(x) => x.amDia} kind="dots" color={col("bp")} label="Morning diastolic" unit="mmHg" refValue={85} refLabel="home threshold" band marks={changeMarks(d)} />
        <DayChart days={days} get={(x) => x.amHr} kind="dots" color={col("bp")} label="Morning heart rate" unit="bpm" band marks={changeMarks(d)} />
        <SubHead>Readings by band ({bp.tirN})</SubHead>
        <RangeBar
          parts={[
            { label: "Systolic < 100", n: bp.tir.low, color: col("water") },
            { label: "100–134 and < 85", n: bp.tir.in, color: "hsl(var(--fg) / .25)" },
            { label: "≥ 135 or ≥ 85", n: bp.tir.high, color: col("bp") },
          ]}
        />
        <SubHead>Week by week (morning medians)</SubHead>
        <Table
          head={["Week", "Days", "BP", "HR"]}
          rows={d.weeks.map((w) => [`${shortDate(w.start)}–${shortDate(w.end)}`, String(w.days), `${fmtNum(w.amSys)}/${fmtNum(w.amDia)}`, fmtNum(w.hr)])}
        />
        {(bp.lows.length > 0 || bp.highs.length > 0) && (
          <>
            <SubHead>Readings outside 100–134 / &lt; 85</SubHead>
            <Table
              head={["When", "Reading", ""]}
              rows={[...bp.lows.map((r) => ({ ...r, k: "low" })), ...bp.highs.map((r) => ({ ...r, k: "high" }))]
                .sort((a, b) => b.ts - a.ts)
                .slice(0, 8)
                .map((r) => [when(r.ts), `${r.sys}/${r.dia}`, r.k])}
            />
          </>
        )}
        <p style={{ ...muted, marginTop: 8 }}>
          Day-to-day swing {fmtNum(bp.arv, 1)} mmHg · {bp.irregular ? `${bp.irregular} flagged irregular` : "no irregular-heartbeat flags"} ·{" "}
          {bp.standingN ? `${bp.standingN} standing readings` : "no standing readings, so a drop on standing can't be checked"}.
        </p>
        {effects(d, ["alc-hr", "alc-sys", "na-sys"]).map((e) => (
          <EffectRow key={e.id} e={e} />
        ))}
      </Section>

      <Section title="Weight" color={col("weight")}>
        <div style={grid3}>
          <Stat label="Last 7 days (median)" value={fmtNum(weight.m7, 1)} unit="kg" />
          <Stat label="vs 4 weeks before" value={signed(weight.m7 - weight.prev, 1)} unit="kg" />
          <Stat
            label="Trend, last 4 weeks"
            value={weight.enough ? signed(weight.slope, 2) : "—"}
            unit="kg/wk"
            sub={weight.enough ? (weight.lo! <= 0 && weight.hi! >= 0 ? "flat within day-to-day noise" : `likely ${signed(weight.lo!, 2)} to ${signed(weight.hi!, 2)}`) : `${weight.n} weigh-ins, need 10`}
          />
        </div>
        <DayChart days={days} get={(x) => x.weight} kind="dots" color={col("weight")} label="First weight of the day, with 7-day median" unit="kg" digits={1} smooth marks={changeMarks(d)} />
        <SubHead>Rapid gain checks (more than 1 kg in a day or 2 kg in 3 days)</SubHead>
        {d.flags.filter((f) => f.title.startsWith("Weight")).length === 0 ? (
          <p style={muted}>None in the last 2 weeks.</p>
        ) : (
          <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12 }}>
            {d.flags
              .filter((f) => f.title.startsWith("Weight"))
              .map((f, i) => (
                <li key={i}>
                  <b>{f.title}</b> <span style={muted}>({shortDate(f.when)})</span>
                </li>
              ))}
          </ul>
        )}
        <SubHead>Week by week</SubHead>
        <Table head={["Week", "Weight", "Fluid", "Sodium"]} rows={d.weeks.map((w) => [`${shortDate(w.start)}–${shortDate(w.end)}`, `${fmtNum(w.weight, 1)} kg`, `${fmtNum(w.water)} ml`, `${fmtNum(w.sodium)} mg`])} />
        {effects(d, ["na-wt", "fl-wt"]).map((e) => (
          <EffectRow key={e.id} e={e} />
        ))}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------

export function FluidChapter({ data: d }: { data: Insights }) {
  const { water, alcohol, caffeine, urine } = d;
  const days = d.inPeriod;
  return (
    <>
      <Section title="Fluid" color={col("water")}>
        <div style={grid3}>
          <Stat label="Days within limit" value={pct(water.p)} sub={`${water.within}/${water.n} logged days · limit ${fmtNum(d.limits.water)} ml`} />
          <Stat label="Typical day" value={fmtNum(water.median)} unit="ml" sub={`most days ${fmtNum(water.p10)}–${fmtNum(water.p90)}`} />
          <Stat label="After 18:00" value={pct(d.fluidClock.slice(6).reduce((s, v) => s + v, 0))} sub="share of the day's fluid" />
        </div>
        <DayChart days={days} get={(x) => x.water} kind="bars" color={col("water")} label="Fluid per day (solid = over limit)" unit="ml" refValue={d.limits.water} refLabel="limit" />
        <SubHead>When it comes in</SubHead>
        <Clock rows={[{ label: "Fluid", v: d.fluidClock, c: col("water") }]} />
      </Section>

      <Section title="Alcohol and caffeine" color={col("alcohol")}>
        <div style={grid3}>
          <Stat label="Drinking days" value={`${alcohol.drinkDays}/${alcohol.n}`} />
          <Stat label="Per week" value={fmtNum(alcohol.perWeek, 1)} unit="std drinks" sub={`${alcohol.heavyDays} days with 5+ · most ${fmtNum(alcohol.maxDay, 1)}`} />
          <Stat label="Caffeine, typical day" value={fmtNum(caffeine.median)} unit="mg" sub={`${caffeine.over400} days over 400 mg`} />
        </div>
        <DayChart days={days} get={(x) => (x.water !== undefined ? x.alcohol ?? 0 : undefined)} kind="bars" color={col("alcohol")} label="Alcohol per day" unit="drinks" digits={1} />
        {effects(d, ["alc-hr", "alc-sys"]).map((e) => (
          <EffectRow key={e.id} e={e} />
        ))}
      </Section>

      <Section title="Urination and bowels" color={col("water")}>
        <div style={grid3}>
          <Stat label="Urinations, typical day" value={fmtNum(urine.perDay)} sub={`${urine.n} days logged`} />
          <Stat label="At night (00–06)" value={fmtNum(urine.nightPerNight)} unit="/night" sub={`${urine.nightsWith2} nights with 2+`} />
          <Stat label="Bowel movements" value={fmtNum(urine.bowelPerWeek, 1)} unit="/week" sub={urine.bowelPerWeek < 3 ? "under 3 a week" : "per week"} />
        </div>
        <DayChart days={days} get={(x) => x.urination} kind="bars" color={col("water")} label="Urinations per day" unit="/day" />
        <p style={{ ...muted, marginTop: 6 }}>Amounts are your small/medium/large estimates, so output is not measured.</p>
        {effects(d, ["late-night"]).map((e) => (
          <EffectRow key={e.id} e={e} />
        ))}
      </Section>
    </>
  );
}

const hhmm = (m: number) => (Number.isFinite(m) ? `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}` : "—");

export function FoodChapter({ data: d, nutrientAnalysis }: { data: Insights; nutrientAnalysis?: ReactNode }) {
  const { sodium, food } = d;
  const days = d.inPeriod;
  return (
    <>
      <Section title="Meals" color={col("sodium")}>
        <div style={grid3}>
          <Stat label="Meals, typical day" value={fmtNum(food.mealsPerDay)} sub={`${food.daysLogged} days with food logged`} />
          <Stat label="First and last meal" value={`${hhmm(food.firstMeal)}–${hhmm(food.lastMeal)}`} sub="typical times" />
          <Stat label="Eaten after 21:00" value={pct(food.lateShare)} sub="share of food items" />
        </div>
        <DayChart days={days} get={(x) => (x.lastMeal !== undefined ? x.lastMeal / 60 : undefined)} kind="dots" color={col("sodium")} label="Time of the last meal (hour of the day)" unit="h" digits={1} />
        {food.topFoods.length > 0 && (
          <>
            <SubHead>Most logged foods</SubHead>
            <Table head={["Food", "Times", "Total"]} rows={food.topFoods.map((f) => [<span key="n" style={{ textTransform: "capitalize" }}>{f.name}</span>, String(f.n), f.grams ? `${fmtNum(f.grams)} g` : "—"])} />
          </>
        )}
      </Section>

      <Section title="Sodium" color={col("sodium")}>
        <div style={grid3}>
          <Stat label="Days within limit" value={pct(sodium.p)} sub={`${sodium.within}/${sodium.n} · limit ${fmtNum(d.limits.sodium)} mg`} />
          <Stat label="Typical day" value={fmtNum(sodium.median)} unit="mg" sub={`most days ${fmtNum(sodium.p10)}–${fmtNum(sodium.p90)}`} />
          <Stat label="Over by (median)" value={Number.isFinite(sodium.medianOver) ? fmtNum(sodium.medianOver) : "—"} unit="mg" sub="on days over" />
        </div>
        <DayChart days={days} get={(x) => x.sodium} kind="bars" color={col("sodium")} label="Sodium per day (solid = over limit)" unit="mg" refValue={d.limits.sodium} refLabel="limit" />
        <SubHead>When it comes in</SubHead>
        <Clock rows={[{ label: "Sodium", v: d.sodiumClock, c: col("sodium") }]} />
        {d.sodiumSources.length > 0 && (
          <>
            <SubHead>Biggest sources</SubHead>
            <Table head={["Food", "Sodium", "Share"]} rows={d.sodiumSources.map((s) => [<span key="l" style={{ textTransform: "capitalize" }}>{s.label}</span>, `${fmtNum(s.mg)} mg`, pct(s.share)])} />
          </>
        )}
      </Section>

      <Section title="Sugar and potassium" color={col("sodium")}>
        <div style={grid3}>
          <Stat label="Sugar, typical day" value={fmtNum(food.sugar.median)} unit="g" sub={food.sugar.limit ? `${food.sugar.within}/${food.sugar.n} days within ${fmtNum(food.sugar.limit)} g` : `${food.sugar.n} days logged`} />
          <Stat label="Potassium, typical day" value={fmtNum(food.potassium.median)} unit="mg" sub={`${food.potassium.n} days logged`} />
        </div>
        <DayChart days={days} get={(x) => x.sugar} kind="bars" color={col("sodium")} label="Sugar per day" unit="g" {...(food.sugar.limit ? { refValue: food.sugar.limit, refLabel: "limit" } : {})} />
        {food.potassium.n < 7 && (
          <p style={{ ...muted, marginTop: 6 }}>
            Potassium is logged on {food.potassium.n} days. Some heart and blood-pressure medicines raise potassium, so log it with food if your care team wants it watched.
          </p>
        )}
      </Section>

      {nutrientAnalysis}
    </>
  );
}

/** Fluid and food together, for the layouts that don't split them. */
export function IntakeChapter({ data, nutrientAnalysis }: { data: Insights; nutrientAnalysis?: ReactNode }) {
  return (
    <>
      <FluidChapter data={data} />
      <FoodChapter data={data} nutrientAnalysis={nutrientAnalysis} />
    </>
  );
}

// ---------------------------------------------------------------------------

export function ChangeCard({ c }: { c: ChangeEvent }) {
  return (
    <div style={{ borderTop: `1px solid ${col("line")}`, paddingTop: 8, marginTop: 8 }}>
      <div style={{ fontSize: 13 }}>
        <span style={muted}>{shortDate(c.date)}</span> <b>{c.medicine}</b> {c.what}
      </div>
      <div style={{ ...muted, fontSize: 11 }}>
        4 weeks before vs 4 weeks starting {c.lag} days after ({c.lagWhy})
      </div>
      <Table
        head={["", "Change", ""]}
        align={["l", "r", "r"]}
        rows={c.responses.map((r) => [
          r.label,
          r.afterNeedsUntil ? `judge from ${shortDate(r.afterNeedsUntil)}` : r.confidence === "too-little-data" ? `${r.nBefore} / ${r.nAfter} days` : `${signed(r.est, r.unit === "kg" ? 1 : 0)} ${r.unit}`,
          <ConfidenceChip key="c" c={r.afterNeedsUntil ? "too-little-data" : r.confidence} />,
        ])}
      />
      {(c.overlaps.length > 0 || c.caveat) && (
        <p style={{ ...muted, marginTop: 4, fontSize: 11 }}>
          {c.overlaps.length > 0 && <>Other changes within 2 weeks ({c.overlaps.slice(0, 3).join(", ")}{c.overlaps.length > 3 ? "…" : ""}), so their effects can&apos;t be separated. </>}
          {c.caveat}
        </p>
      )}
    </div>
  );
}

export function MedsChapter({ data: d }: { data: Insights }) {
  const a = d.adherence;
  return (
    <>
      <Section title="Taking your medicines" color={col("meds")}>
        <div style={grid3}>
          <Stat label="Doses taken" value={pct(a.taken / a.due)} sub={`${a.taken}/${a.due} scheduled`} />
          <Stat label="Days fully covered" value={pct(a.fullDays / a.days)} sub={`${a.fullDays}/${a.days} days`} />
          <Stat label="Within 60 min of time" value={pct(a.onTime / a.taken)} sub={`median ${signed(a.medianDelay)} min`} />
        </div>
        <DayChart days={d.inPeriod} get={(x) => (x.dosesDue ? (100 * x.dosesOnTime) / x.dosesDue : undefined)} kind="bars" color={col("meds")} label="Doses on time each day" unit="%" />
        <SubHead>By medicine</SubHead>
        <Table head={["Medicine", "Taken", "On time", "Typical delay"]} rows={a.byMedicine.map((m) => [m.name, pct(m.taken / m.due), pct(m.onTime / Math.max(1, m.taken)), `${signed(m.medianDelay)} min`])} />
        <SubHead>By dose time</SubHead>
        <Table head={["Slot", "Doses", "Typical delay", "Worst 1 in 10"]} rows={a.slots.map((s) => [s.time, String(s.n), `${signed(s.median)} min`, `${signed(s.p90)} min`])} />
        {a.prn.length > 0 && (
          <>
            <SubHead>As-needed doses</SubHead>
            <Table head={["When", "Medicine"]} align={["l", "l"]} rows={a.prn.slice(0, 8).map((p) => [when(p.ts), p.name])} />
          </>
        )}
      </Section>
      <Section title="Did each change do anything?" color={col("meds")}>
        {d.changes.length === 0 ? <p style={muted}>No medicine changes recorded.</p> : d.changes.slice(0, 8).map((c, i) => <ChangeCard key={i} c={c} />)}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------

export function JournalChapter({ data: d }: { data: Insights }) {
  const s = d.symptoms;
  return (
    <>
      <Section title="Symptoms and signs" color={col("journal")}>
        {s.counts.length === 0 ? (
          <p style={muted}>No symptoms or signs in the journal in this period.</p>
        ) : (
          <Table head={["Finding", "Times", "Typical severity"]} rows={s.counts.map((c) => [c.finding, String(c.n), Number.isFinite(c.severity) ? `${fmtNum(c.severity)}/10` : "—"])} />
        )}
        {s.patterns.map((p) => (
          <p key={p.finding} style={{ fontSize: 13, marginTop: 8 }}>
            <b>{p.finding}</b> ×{p.n}: {p.text}.
          </p>
        ))}
        <p style={{ ...muted, marginTop: 6 }}>A pattern needs 5 or more entries of the same finding.</p>
      </Section>
      <Section title="What came before each entry" color={col("journal")}>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
          {s.entries.slice(0, 20).map((x) => (
            <li key={x.entry.id} style={{ fontSize: 12, borderTop: `1px solid ${col("line")}`, paddingTop: 4 }}>
              <b>{x.entry.finding}</b>{" "}
              <span style={muted}>
                {when(x.entry.timestamp)}
                {x.entry.severity !== null ? ` · ${x.entry.severity}/10` : ""}
              </span>
              <div style={{ fontSize: 12 }}>{x.entry.words}</div>
              <div style={muted}>
                {[
                  x.lastBp && `BP ${x.lastBp.sys}/${x.lastBp.dia}${x.lastBp.hr ? ` HR ${x.lastBp.hr}` : ""} ${fmtNum(x.lastBp.hoursBefore)} h before`,
                  x.hoursSinceDose && `${fmtNum(x.hoursSinceDose.h, 1)} h after ${x.hoursSinceDose.name}`,
                  x.weightVsUsual !== undefined && `weight ${signed(x.weightVsUsual, 1)} kg vs usual`,
                  x.alcohol24h > 0 && `${fmtNum(x.alcohol24h, 1)} drinks in prior 24 h`,
                  x.sodiumDayBefore !== undefined && `${fmtNum(x.sodiumDayBefore)} mg sodium day before`,
                  ...x.lateOrMissed24h,
                ]
                  .filter(Boolean)
                  .join(" · ") || "nothing else logged nearby"}
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
