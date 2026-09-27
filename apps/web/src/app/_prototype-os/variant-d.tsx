"use client";

// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// Variant D, "Medical OS": the home screen is a dashboard. Today's metric
// widgets (what the current app shows at the top: water, sodium, sugar,
// potassium against their limits, the week) stay on top, each tap opening
// its window; the last readings sit under them; the launcher for everything
// else is below. Windows stay open side by side (wide) or one at a time with
// instant switching (phone).

import { useSettingsStore } from "@/stores/settings-store";
import {
  AppTile,
  MedShell,
  MeterRow,
  PAGES,
  SmallCaps,
  WINDOWS,
  WeekColumns,
  Widget,
  tone,
  useWeek,
  type ShellApi,
  type WinId,
} from "@/app/_prototype-os/med-kit";
import { ago, fmt, useMinute } from "@/app/_prototype-os/os-kit";

const DATE = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const LAUNCH: WinId[] = ["water", "food", "bp", "weight", "bathroom", "week"];

function Dashboard({ open, show, today }: ShellApi) {
  const now = useMinute();
  const week = useWeek();
  const waterLimit = useSettingsStore((s) => s.waterLimit);
  const saltLimit = useSettingsStore((s) => s.saltLimit);
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-3 px-3 pt-4 pb-6">
      <header className="flex items-baseline justify-between px-1">
        <h1 className="text-lg font-semibold">Today</h1>
        <span className="text-xs text-muted-foreground">
          {now ? DATE.format(now) : ""} · day starts {String(dayStartHour).padStart(2, "0")}:00
        </span>
      </header>

      <Widget title="Intake today" action="Details" onAction={() => show("today")}>
        <div className="divide-y divide-border">
          {today.meters.map((m) => (
            <MeterRow key={m.key} meter={m} onOpen={() => show(m.key === "water" ? "water" : "food")} />
          ))}
        </div>
      </Widget>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => show("bp")} aria-label="Open Blood pressure" className="border border-border border-l-2 bg-card px-3 py-3 text-left hover:bg-muted/50" style={{ borderLeftColor: tone("bp") }}>
          <SmallCaps>Blood pressure</SmallCaps>
          <span data-med-num className="mt-1 block text-lg font-semibold">
            {today.bp ? `${today.bp.systolic}/${today.bp.diastolic}` : "—"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">mmHg</span>
          </span>
          <span className="block text-xs text-muted-foreground">
            {today.bp ? `last reading ${ago(today.bp.timestamp, now)}` : "no reading yet"}
          </span>
        </button>
        <button type="button" onClick={() => show("weight")} aria-label="Open Weight" className="border border-border border-l-2 bg-card px-3 py-3 text-left hover:bg-muted/50" style={{ borderLeftColor: tone("weight") }}>
          <SmallCaps>Weight</SmallCaps>
          <span data-med-num className="mt-1 block text-lg font-semibold">
            {today.weight ? fmt(today.weight.weight) : "—"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">kg</span>
          </span>
          <span className="block text-xs text-muted-foreground">
            {today.weight ? `last weighed ${ago(today.weight.timestamp, now)}` : "not weighed yet"}
          </span>
        </button>
      </div>

      <p data-med-num className="flex gap-4 px-1 text-xs text-muted-foreground">
        <span>
          <span style={{ color: tone("caffeine") }}>■</span> Caffeine {fmt(today.caffeineMg)} mg today
        </span>
        <span>
          <span style={{ color: tone("alcohol") }}>■</span> Alcohol {fmt(today.alcoholDrinks)} drinks
        </span>
      </p>

      <Widget title="This week" action="Open" onAction={() => show("week")}>
        <div className="space-y-4 px-4 py-3">
          <WeekColumns label="Water" values={week.water} limit={waterLimit} unit="ml" domain="water" todayIndex={week.todayIndex} dayKeys={week.dayKeys} />
          <WeekColumns label="Sodium" values={week.sodium} limit={saltLimit} unit="mg" domain="sodium" todayIndex={week.todayIndex} dayKeys={week.dayKeys} />
        </div>
      </Widget>

      <section aria-label="Open" className="pt-2">
        <div className="px-1 pb-1">
          <SmallCaps>Log and review</SmallCaps>
        </div>
        <div className="grid grid-cols-4 gap-1 border border-border bg-card p-1">
          {LAUNCH.map((id) => (
            <AppTile key={id} label={WINDOWS[id].label} icon={WINDOWS[id].icon} domain={WINDOWS[id].domain} open={open.includes(id)} onOpen={() => show(id)} />
          ))}
          {PAGES.map((p) => (
            <AppTile key={p.href} label={p.label} icon={p.icon} domain={p.domain} href={p.href} />
          ))}
        </div>
        <p className="px-1 pt-2 text-xs text-muted-foreground">
          Open several at once: they stay open, with what you typed, until you close them.
        </p>
      </section>
    </div>
  );
}

export function VariantD() {
  return <MedShell label="Intake home" dashboard={(api) => <Dashboard {...api} />} />;
}
