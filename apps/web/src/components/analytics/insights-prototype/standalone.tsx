/**
 * PROTOTYPE — throwaway. Standalone entry for the hosted, shareable build of
 * the three insights variants (bundled with esbuild into one HTML file).
 * Runs the real engine and variant components on generated EXAMPLE data, so
 * nobody's health records leave the device.
 */

import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { EngineInput } from "@/components/analytics/insights-prototype/engine";
import { runEngine } from "@/components/analytics/insights-prototype/engine";
import { METRICS_VARIANTS, MetricsPrototype } from "@/components/analytics/insights-prototype/metrics-prototype";
import type { TimeRange } from "@intake/types/analytics";
import { Download, FileText, Sparkles, Apple } from "lucide-react";
import { Button } from "@intake/ui/button";
import type { Insights } from "@/components/analytics/insights-prototype/engine";
import { PrototypeSwitcher } from "@/components/prototype/prototype-switcher";


// ---------------------------------------------------------------------------
// Example data: about 75 days shaped like a fluid- and sodium-restricted
// heart-failure log (morning BP, daily weigh-in, ~10 drinks a day, evening
// alcohol on about half the days, twice-daily medicines, a dose change).
// ---------------------------------------------------------------------------

function exampleInput(): EngineInput {
  const DAY = 86_400_000;
  const now = Date.now();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let seed = 11;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const id = () => Math.random().toString(36).slice(2);
  const meta = { createdAt: now, updatedAt: now, deletedAt: null, deviceId: "example", timezone: tz };
  const at = (d: number, h: number, m = 0) => {
    const t = new Date(now - d * DAY);
    t.setHours(h, m, 0, 0);
    return t.getTime();
  };
  const dateKey = (ts: number) => new Date(ts).toLocaleDateString("en-CA");

  const inp: EngineInput = {
    now, tz, dayStartHour: 2, waterLimit: 1500, saltLimit: 2000, sugarLimit: 30, potassiumLimit: 3500, eating: [],
    intake: [], weight: [], bp: [], urination: [], defecation: [], substance: [],
    doseLogs: [], phases: [], schedules: [], prescriptions: [], journal: [],
  };

  const meds = [
    { name: "Carvedilol", times: ["08:00", "20:00"] },
    { name: "Sacubitril/valsartan", times: ["08:00", "20:00"] },
    { name: "Spironolactone", times: ["08:00"] },
    { name: "Dapagliflozin", times: ["08:00"] },
  ];
  const changeDay = 20;
  const changeKey = dateKey(at(changeDay, 12));
  for (const m of meds) {
    const rx = { id: id(), genericName: m.name, isActive: true, ...meta };
    inp.prescriptions.push(rx);
    const ph = { id: id(), prescriptionId: rx.id, type: "maintenance" as const, unit: "mg", startDate: at(48, 9), foodInstruction: "none" as const, status: "active" as const, ...meta };
    inp.phases.push(ph);
    if (m.name === "Carvedilol") {
      for (const time of m.times) {
        const base = { phaseId: ph.id, time, scheduleTimeUTC: 0, anchorTimezone: tz, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], enabled: true, unit: "mg", ...meta };
        inp.schedules.push({ ...base, id: id(), dosage: 6.25, effectiveTo: changeKey });
        inp.schedules.push({ ...base, id: id(), dosage: 12.5, effectiveFrom: changeKey });
      }
    }
    (m as { rxId?: string; phId?: string }).rxId = rx.id;
    (m as { rxId?: string; phId?: string }).phId = ph.id;
  }

  let w = 70.1;
  let drankPrev = 0;
  for (let d = 150; d >= 0; d--) {
    const after = d < changeDay;
    const drinks = r() < 0.5 ? Math.round((1 + r() * 6) * 10) / 10 : 0;
    const salty = r() < 0.6;
    w += (r() - 0.5) * 0.45 + (salty ? 0.06 : -0.06);
    w = Math.max(68.6, Math.min(71.3, w));
    if (d === 2) w += 1.2;
    inp.weight.push({ id: id(), weight: Math.round(w * 100) / 100, timestamp: at(d, 9, 5), ...meta });

    const hr = Math.round((after ? 68 : 78) + (drankPrev >= 3 ? 8 : 0) + (r() - 0.5) * 10);
    const sys = Math.round((after ? 110 : 121) + (r() - 0.5) * 18 + (d < 7 ? 7 : 0));
    inp.bp.push({ id: id(), systolic: sys, diastolic: Math.round(sys * 0.63 + (r() - 0.5) * 6), heartRate: hr, position: "sitting", arm: "left", timestamp: at(d, 8 + Math.round(r()), 40), ...meta });

    const drinksN = 7 + Math.round(r() * 5);
    for (let k = 0; k < drinksN; k++) {
      const h = Math.min(23, 8 + Math.round((k / drinksN) * 15 + r()));
      inp.intake.push({ id: id(), type: "water", amount: 120 + Math.round(r() * 230), timestamp: at(d, h, Math.round(r() * 59)), source: "manual", ...meta });
    }
    const foods = ["bread", "cheese", "soup", "ham", "crisps", "pizza"];
    for (let k = 0; k < 3; k++) {
      const f = foods[Math.floor(r() * foods.length)]!;
      inp.intake.push({ id: id(), type: "salt", amount: Math.round((salty ? 850 : 450) + r() * 350), timestamp: at(d, [13, 17, 21][k]!, 15), source: `food:${f}`, ...meta });
    }
    inp.substance.push({ id: id(), type: "caffeine", amountMg: 150 + Math.round(r() * 250), description: "coffee", source: "standalone", timestamp: at(d, 10, 30), ...meta });
    if (drinks) inp.substance.push({ id: id(), type: "alcohol", amountStandardDrinks: drinks, description: "wine", source: "standalone", timestamp: at(d, 21, 0), ...meta });

    const ur = 4 + Math.round(r() * 2);
    for (let k = 0; k < ur; k++) {
      const night = k === 0 && r() < (drinks >= 3 ? 0.7 : 0.25);
      inp.urination.push({ id: id(), amountEstimate: "medium", timestamp: at(d, night ? 3 : 9 + k * 3), ...meta });
    }
    const meals: [number, string[]][] = [[8, ["toast", "coffee with milk"]], [13, ["ham sandwich", "apple"]], [20 + Math.round(r() * 2), ["pasta", "salad", "cheese"]]];
    for (const [h, items] of meals) for (const it of items) (inp.eating ??= []).push({ id: id(), timestamp: at(d, h, 10), grams: 80 + Math.round(r() * 150), note: it, ...meta });
    inp.intake.push({ id: id(), type: "sugar", amount: Math.round(25 + r() * 35), timestamp: at(d, 15), source: "manual", ...meta });
    if (r() < 0.2) inp.intake.push({ id: id(), type: "potassium", amount: Math.round(1800 + r() * 1500), timestamp: at(d, 15), source: "manual", ...meta });
    if (r() < 0.7) inp.defecation.push({ id: id(), amountEstimate: "medium", timestamp: at(d, 10), ...meta });

    if (d <= 45 && d > 0) {
      for (const m of meds) {
        for (const time of m.times) {
          const [hh] = time.split(":").map(Number);
          const late = Math.round(r() * (hh! >= 20 ? 150 : 90) - 15);
          const skipped = r() < 0.03;
          inp.doseLogs.push({
            id: id(), prescriptionId: (m as { rxId?: string }).rxId!, medicineName: m.name, phaseId: (m as { phId?: string }).phId!,
            scheduledDate: dateKey(at(d, 12)), scheduledTime: time, status: skipped ? "skipped" : "taken", kind: "scheduled",
            ...(skipped ? {} : { actionTimestamp: at(d, hh!, 0) + late * 60_000 }), ...meta,
          });
        }
      }
    }
    if (d % 6 === 2) inp.journal.push({ id: id(), timestamp: at(d, 9, 50), timePrecision: "exact", words: "Dizzy when I stood up after breakfast", finding: "Dizziness", kind: "symptom", places: [], severity: 3, ...meta });
    if (d === 9 || d === 23) inp.journal.push({ id: id(), timestamp: at(d, 23, 10), timePrecision: "exact", words: "Short of breath lying flat", finding: "Breathlessness", kind: "symptom", places: [], severity: 4, ...meta });
    drankPrev = drinks;
  }
  return inp;
}

function readHash() {
  const h = window.location.hash.replace("#", "").toUpperCase();
  return METRICS_VARIANTS.some((v) => v.key === h) ? h : "A";
}

const INPUT = exampleInput();
function useExampleInsights(period: number) {
  return useMemo(() => runEngine(INPUT, period), [period]);
}

/** Stand-in for the real Records tab (which reads the device database). */
function ExampleRecords({ range }: { range: TimeRange }) {
  const rows = [
    ...INPUT.bp.map((r) => ({ ts: r.timestamp, what: "Blood pressure", v: `${r.systolic}/${r.diastolic} · HR ${r.heartRate ?? "—"}` })),
    ...INPUT.weight.map((r) => ({ ts: r.timestamp, what: "Weight", v: `${r.weight} kg` })),
    ...INPUT.journal.map((r) => ({ ts: r.timestamp, what: "Journal", v: r.finding })),
  ]
    .filter((r) => r.ts >= range.start && r.ts <= range.end)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 60);
  return (
    <div className="wm-card">
      <p className="wm-p" style={{ marginBottom: 8 }}>Records tab stays as it is today (example rows shown).</p>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "6px 0", borderTop: "1px solid hsl(var(--line))" }}>
          <span>{r.what}</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{r.v}</span>
          <span className="wm-p">{new Date(r.ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      ))}
    </div>
  );
}

// Stand-ins for parts that need the app (downloads, the AI routes).
function ExampleExport() {
  const [note, setNote] = useState<string | null>(null);
  return (
    <div style={{ flex: "1 1 100%" }}>
      <div className="wm-exp">
        <Button variant="outline" onClick={() => setNote("In the app this downloads this report as a PDF for your care team.")}>
          <FileText />
          Export report
        </Button>
        <Button variant="outline" onClick={() => setNote("In the app this downloads every record in the period as CSV.")}>
          <Download />
          Export CSV
        </Button>
      </div>
      {note && <p className="wm-p" style={{ marginTop: 6 }}>{note}</p>}
    </div>
  );
}

function ExampleAi({ title, button, icon, text }: { title: string; button: string; icon: React.ReactNode; text: () => string }) {
  const [out, setOut] = useState<string | null>(null);
  return (
    <section className="wm-card" style={{ ["--c" as string]: "hsl(var(--ai))" }} aria-label={title}>
      <h3 className="wm-ct">
        {icon}
        {title}
      </h3>
      {out ? (
        <>
          <p style={{ fontSize: 13, lineHeight: 1.5 }}>{out}</p>
          <p className="wm-p" style={{ marginTop: 6 }}>Example output. In the app Claude writes this from the report&apos;s numbers, never your raw entries.</p>
        </>
      ) : (
        <Button variant="outline" onClick={() => setOut(text())}>
          {button}
        </Button>
      )}
    </section>
  );
}

const aiSummary = (d: Insights) =>
  `Over ${d.period} days your home blood pressure averaged ${Math.round(d.bp.sys)}/${Math.round(d.bp.dia)}, all readings below the 135/85 home threshold, but only morning readings were taken. ` +
  `Fluid stayed within your limit on ${Math.round(d.water.p * 100)}% of days and sodium on ${Math.round(d.sodium.p * 100)}%, with most sodium from ${d.sodiumSources[0]?.label ?? "food"}. ` +
  `${d.alcohol.drinkDays} of ${d.alcohol.n} days included alcohol, and after 3+ drinks your next-morning heart rate tended to be higher. ` +
  `Doses were taken ${Math.round((d.adherence.taken / d.adherence.due) * 100)}% of the time, typically ${Math.round(d.adherence.medianDelay)} minutes late. Dizziness was logged ${d.symptoms.counts.find((c) => /dizz/i.test(c.finding))?.n ?? 0} times, mostly within 3 hours of a dose.`;

function App() {
  const [variant, setVariant] = useState(readHash);
  useEffect(() => {
    const on = () => setVariant(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const choose = (k: string) => {
    setVariant(k);
    try {
      history.replaceState(null, "", `#${k}`);
    } catch {
      // the frame may refuse; the variant still switches
    }
  };
  return (
    <>
      <MetricsPrototype
        key={variant}
        variant={variant}
        useInsights={useExampleInsights}
        records={(range) => <ExampleRecords range={range} />}
        exportSlot={() => <ExampleExport />}
        aiInsights={<ExampleAi title="AI Insights" button="Summarise this report" icon={<Sparkles />} text={() => aiSummary(runEngine(INPUT, 30))} />}
        nutrientAnalysis={
          <ExampleAi
            title="Nutrient analysis"
            button="Analyse the last 30 days of food"
            icon={<Apple />}
            text={() => "Your logged meals lean on bread, cheese and processed meats, which carry most of your sodium. Swapping the daily ham and soup for unsalted alternatives would bring most days under your sodium limit. Fibre and potassium-rich vegetables are rare in the log."}
          />
        }
      />
      <PrototypeSwitcher variants={METRICS_VARIANTS} current={variant} onChange={choose} />
    </>
  );
}

// Mounted in place of the Metrics window body inside a snapshot of the real
// app shell, so the variants are judged against the real chrome.
createRoot(document.getElementById("proto-root")!).render(<App />);
