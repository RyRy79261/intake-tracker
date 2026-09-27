"use client";

// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// Variant E, "Widget board": the home screen is a two-column board of live
// tiles, one per thing tracked, sized by how much they have to say (water
// and the week span both columns). Every tile opens its window; the water
// tile also logs a glass in place. Same windows and bottom bar as D.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useIntake } from "@/hooks/use-intake-queries";
import { useUrinationRecords } from "@/hooks/use-urination-queries";
import { useSettingsStore } from "@/stores/settings-store";
import { useToast } from "@intake/ui/use-toast";
import { reportSaveError } from "@/lib/db-recovery";
import {
  Bar,
  MedShell,
  PAGES,
  SmallCaps,
  WINDOWS,
  WeekColumns,
  meterDomain,
  meterHint,
  tone,
  useWeek,
  type Domain,
  type ShellApi,
  type WinId,
} from "@/app/_prototype-os/med-kit";
import { ago, fmt, useMinute } from "@/app/_prototype-os/os-kit";

const DATE = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** A tile: the whole face opens its window; its colour runs down the left. */
function Tile({
  id,
  domain,
  wide = false,
  open,
  onOpen,
  title,
  children,
  extra,
}: {
  id: WinId;
  domain: Domain;
  wide?: boolean;
  open: boolean;
  onOpen: () => void;
  title: string;
  children: ReactNode;
  /** Controls under the face (kept out of the open button). */
  extra?: ReactNode;
}) {
  const Icon = WINDOWS[id].icon;
  return (
    <div className={`flex flex-col border border-border border-l-2 bg-card ${wide ? "col-span-2" : ""}`} style={{ borderLeftColor: tone(domain) }}>
      <button type="button" onClick={onOpen} aria-label={`Open ${WINDOWS[id].label}`} className="flex-1 px-3 pt-2.5 pb-3 text-left hover:bg-muted/50">
        <span className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Icon aria-hidden className="size-3.5" style={{ color: tone(domain) }} />
            <SmallCaps>{title}</SmallCaps>
          </span>
          {open && <span className="text-[10px] text-muted-foreground">open</span>}
        </span>
        {children}
      </button>
      {extra}
    </div>
  );
}

function Board({ open, show, today }: ShellApi) {
  const now = useMinute();
  const week = useWeek();
  const waterLimit = useSettingsStore((s) => s.waterLimit);
  const saltLimit = useSettingsStore((s) => s.saltLimit);
  const waterIncrement = useSettingsStore((s) => s.waterIncrement);
  const water = useIntake("water");
  const pee = useUrinationRecords(1);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const w = today.water;
  const rest = today.meters.filter((m) => m.key !== "water");

  async function addGlass() {
    if (busy) return;
    setBusy(true);
    try {
      await water.addRecord(waterIncrement, "manual");
      toast({ title: `Added ${fmt(waterIncrement)} ml`, description: "Water intake recorded", variant: "success" });
    } catch (err) {
      reportSaveError("water", err);
      toast({ title: "Could not save", description: "Try again, or open Water.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-3 pt-4 pb-6">
      <header className="flex items-baseline justify-between px-1 pb-3">
        <h1 className="text-lg font-semibold">Today</h1>
        <span className="text-xs text-muted-foreground">{now ? DATE.format(now) : ""}</span>
      </header>

      <div className="grid grid-cols-2 gap-2.5">
        <Tile
          id="water"
          domain="water"
          wide
          open={open.includes("water")}
          onOpen={() => show("water")}
          title="Water"
          extra={
            <div className="flex border-t border-border">
              <button type="button" onClick={addGlass} disabled={busy} className="h-10 flex-1 text-sm font-medium hover:bg-muted disabled:opacity-50" style={{ color: tone("water") }}>
                + {fmt(waterIncrement)} ml
              </button>
              <button type="button" onClick={() => show("water")} className="h-10 flex-1 border-l border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                Other drinks
              </button>
            </div>
          }
        >
          <span data-med-num className="mt-1.5 block text-3xl font-semibold leading-none">
            {fmt(w.value)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">ml</span>
          </span>
          <Bar meter={w} domain="water" className="mt-2.5" />
          <span className={`mt-1.5 block text-xs ${w.value > w.limit ? "text-destructive" : "text-muted-foreground"}`}>{meterHint(w)}</span>
        </Tile>

        {rest.map((m) => (
          <Tile key={m.key} id="food" domain={meterDomain(m)} open={open.includes("food")} onOpen={() => show("food")} title={m.label}>
            <span data-med-num className="mt-1.5 block text-xl font-semibold leading-none">
              {fmt(m.value)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">{m.unit}</span>
            </span>
            <Bar meter={m} domain={meterDomain(m)} className="mt-2" />
            <span className={`mt-1.5 block text-[11px] leading-snug ${!m.target && m.value > m.limit ? "text-destructive" : "text-muted-foreground"}`}>
              {meterHint(m)}
            </span>
          </Tile>
        ))}

        <Tile id="bp" domain="bp" open={open.includes("bp")} onOpen={() => show("bp")} title="Blood pressure">
          <span data-med-num className="mt-1.5 block text-xl font-semibold leading-none">
            {today.bp ? `${today.bp.systolic}/${today.bp.diastolic}` : "—"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">mmHg</span>
          </span>
          <span className="mt-1.5 block text-[11px] text-muted-foreground">
            {today.bp ? `last reading ${ago(today.bp.timestamp, now)}` : "no reading yet · tap to log"}
          </span>
        </Tile>

        <Tile id="weight" domain="weight" open={open.includes("weight")} onOpen={() => show("weight")} title="Weight">
          <span data-med-num className="mt-1.5 block text-xl font-semibold leading-none">
            {today.weight ? fmt(today.weight.weight) : "—"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">kg</span>
          </span>
          <span className="mt-1.5 block text-[11px] text-muted-foreground">
            {today.weight ? `last weighed ${ago(today.weight.timestamp, now)}` : "not weighed yet · tap to log"}
          </span>
        </Tile>

        <Tile id="bathroom" domain="bathroom" open={open.includes("bathroom")} onOpen={() => show("bathroom")} title="Bathroom">
          <span className="mt-1.5 block text-sm font-medium">{pee[0] ? `Last ${ago(pee[0].timestamp, now)}` : "Nothing yet"}</span>
          <span className="mt-1 block text-[11px] text-muted-foreground">urination and bowel movements</span>
        </Tile>

        <Tile id="today" domain="neutral" open={open.includes("today")} onOpen={() => show("today")} title="Other today">
          <span data-med-num className="mt-1.5 block text-sm">
            <span style={{ color: tone("caffeine") }}>■</span> {fmt(today.caffeineMg)} mg caffeine
          </span>
          <span data-med-num className="mt-0.5 block text-sm">
            <span style={{ color: tone("alcohol") }}>■</span> {fmt(today.alcoholDrinks)} alcoholic drinks
          </span>
        </Tile>

        <Tile id="week" domain="neutral" wide open={open.includes("week")} onOpen={() => show("week")} title="This week">
          <span className="mt-2 block space-y-3">
            <WeekColumns label="Water" values={week.water} limit={waterLimit} unit="ml" domain="water" todayIndex={week.todayIndex} dayKeys={week.dayKeys} />
            <WeekColumns label="Sodium" values={week.sodium} limit={saltLimit} unit="mg" domain="sodium" todayIndex={week.todayIndex} dayKeys={week.dayKeys} />
          </span>
        </Tile>

        <nav aria-label="More" className="col-span-2 grid grid-cols-3 gap-2.5">
          {PAGES.map((p) => (
            <Link key={p.href} href={p.href} className="flex items-center gap-2 border border-border border-l-2 bg-card px-3 py-3 text-sm hover:bg-muted/50" style={{ borderLeftColor: tone(p.domain) }}>
              <p.icon aria-hidden className="size-4 shrink-0" style={{ color: tone(p.domain) }} />
              <span className="truncate">{p.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function VariantE() {
  return <MedShell label="Intake widget board" dashboardWidth="md:w-[28rem]" dashboard={(api) => <Board {...api} />} />;
}
