"use client";

// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// Variant C, "Terminal": a boot-style status readout at the top (today's
// totals against the limits in the system monospace, a blinking cursor),
// then big slab quick-log buttons low on the screen where a thumb reaches,
// and every card one tap away in a full-screen OS window. The +water slab
// logs straight away through the real intake hook.

import { useState } from "react";
import Link from "next/link";
import { useAuthGate } from "@/components/auth-guard";
import { useIntake } from "@/hooks/use-intake-queries";
import { useSettingsStore } from "@/stores/settings-store";
import { useToast } from "@intake/ui/use-toast";
import { reportSaveError } from "@/lib/db-recovery";
import {
  BottomBar,
  LINKS,
  OsDesktop,
  PhoneSheet,
  PhoneWindow,
  PixelIcon,
  PROGRAMS,
  ProgramBody,
  Surface,
  TodayBody,
  WindowList,
  ago,
  dayLabel,
  fmt,
  useMinute,
  useToday,
  useWindows,
  type Meter,
  type ProgramId,
} from "@/app/_prototype-os/os-kit";

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

/** "■■■■■■□□□□" in colour: a text bar for the readout. */
function TextBar({ meter }: { meter: Meter }) {
  const n = 10;
  const ratio = meter.limit > 0 ? meter.value / meter.limit : 0;
  const filled = Math.round(Math.min(Math.max(ratio, 0), 1) * n);
  const over = !meter.target && ratio > 1;
  const tone = over ? "text-(--os-danger)" : meter.target ? "text-(--os-accent-text)" : ratio >= 0.85 ? "text-(--os-primary-text)" : "text-(--os-fg)";
  return (
    <span aria-hidden className="tracking-[-0.05em]">
      <span className={tone}>{"■".repeat(filled)}</span>
      <span className="text-(--os-fg)/20">{"■".repeat(n - filled)}</span>
    </span>
  );
}

function Row({ label, children, delay }: { label: string; children: React.ReactNode; delay: number }) {
  return (
    <div className="os-term-line flex gap-2 whitespace-nowrap" style={{ animationDelay: `${delay}ms` }}>
      <span className="w-[8.75rem] shrink-0 text-(--os-muted)">
        {label}
        <span className="text-(--os-fg)/25">{" ".padEnd(Math.max(1, 16 - label.length), ".")}</span>
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

export function VariantC() {
  const w = useWindows();
  const [sheet, setSheet] = useState<"today" | "windows" | null>(null);
  const today = useToday();
  const now = useMinute();
  const showVoice = useAuthGate();
  const water = useIntake("water");
  const waterIncrement = useSettingsStore((s) => s.waterIncrement);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const covered = w.front !== null || sheet !== null;

  const open = (id: ProgramId) => {
    setSheet(null);
    w.show(id);
  };

  async function quickWater() {
    if (busy) return;
    setBusy(true);
    try {
      await water.addRecord(waterIncrement, "manual");
      toast({ title: `Added ${fmt(waterIncrement)} ml`, description: "Water intake recorded", variant: "success" });
    } catch (err) {
      reportSaveError("water", err);
      toast({ title: "Could not save", description: "Try again, or use the Water window.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const programs: ProgramId[] = ["water", "food", "bp", "weight", "bathroom", "week", ...(showVoice ? (["voice"] as const) : [])];
  let d = 0;
  const step = () => (d += 70);

  return (
    <OsDesktop label="Intake terminal">
      <Surface paused={covered} />
      <div
        inert={covered || undefined}
        className="absolute inset-x-0 top-0 bottom-(--os-bar-h) overflow-y-auto overscroll-contain"
      >
        <div className="relative mx-auto flex min-h-full max-w-lg flex-col gap-4 px-3 pb-6 pt-3">
          {/* The readout: a terminal window, the one screen of numbers. */}
          <section aria-label="Today's readout" className="border border-(--os-line) bg-(--os-bg)/90 shadow-[6px_6px_0_0_rgb(0_0_0/0.4)]">
            <div className="flex h-8 select-none items-center justify-between border-b border-(--os-line) bg-(--os-chrome) px-2.5">
              <span className="os-pixel text-[11px] uppercase tracking-[0.2em] text-(--os-fg)">Status</span>
              <span className="os-mono text-[10px] uppercase text-(--os-muted)">{now ? `${dayLabel(now)} ${TIME.format(now)}` : ""}</span>
            </div>
            <div className="os-mono space-y-0.5 p-3 text-[13px] leading-5 text-(--os-fg)">
              <div className="os-term-line text-(--os-accent-text)" style={{ animationDelay: "0ms" }}>
                INTAKE OS · checking today …… <span className="text-(--os-fg)">OK</span>
              </div>
              {today.meters.map((m) => (
                <Row key={m.key} label={m.label} delay={step()}>
                  <span className="tabular-nums">
                    {fmt(m.value)}/{fmt(m.limit)} {m.unit}
                  </span>{" "}
                  <TextBar meter={m} />
                </Row>
              ))}
              <Row label="Blood pressure" delay={step()}>
                {today.bp ? (
                  <>
                    <span className="tabular-nums">
                      {today.bp.systolic}/{today.bp.diastolic}
                    </span>{" "}
                    <span className="text-(--os-muted)">{ago(today.bp.timestamp, now)}</span>
                  </>
                ) : (
                  <span className="text-(--os-muted)">none yet</span>
                )}
              </Row>
              <Row label="Weight" delay={step()}>
                {today.weight ? (
                  <>
                    <span className="tabular-nums">{fmt(today.weight.weight)} kg</span>{" "}
                    <span className="text-(--os-muted)">{ago(today.weight.timestamp, now)}</span>
                  </>
                ) : (
                  <span className="text-(--os-muted)">none yet</span>
                )}
              </Row>
              <div className="os-term-line pt-1" style={{ animationDelay: `${step()}ms` }}>
                <span className="text-(--os-primary-text)">&gt;</span> ready
                <span aria-hidden className="os-cursor ml-1 inline-block h-[1.05em] w-[0.6em] translate-y-[0.15em] bg-(--os-fg)" />
              </div>
            </div>
          </section>

          <div className="flex-1" />

          {/* Quick log: slabs, low on the screen, two to a row. */}
          <section aria-label="Quick log" className="flex flex-col gap-3">
            <h2 className="os-mono flex items-center gap-2 px-1 text-[10px] font-normal uppercase tracking-[0.3em] text-(--os-muted)">
              Quick log
              <span aria-hidden className="h-px flex-1 bg-(--os-line)/60" />
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 pr-1">
              <button type="button" onClick={quickWater} disabled={busy} className="os-slab flex h-16 items-center justify-center gap-2 px-2 disabled:opacity-60">
                <PixelIcon name="water" className="size-5" />+{fmt(waterIncrement)} ml water
              </button>
              <button type="button" onClick={() => open("food")} className="os-slab flex h-16 items-center justify-center gap-2 px-2">
                <PixelIcon name="food" className="size-5" />
                Log sodium
              </button>
              <button type="button" onClick={() => open("bp")} className="os-slab flex h-16 items-center justify-center gap-2 px-2">
                <PixelIcon name="heart" className="size-5" />
                Blood pressure
              </button>
              <button type="button" onClick={() => open("weight")} className="os-slab flex h-16 items-center justify-center gap-2 px-2">
                <PixelIcon name="scale" className="size-5" />
                Weight
              </button>
            </div>
          </section>

          {/* Everything else: a plain list, each row a window or a page. */}
          <nav aria-label="Everything" className="mt-2 border border-(--os-line) bg-(--os-panel)">
            <ul className="divide-y divide-(--os-line)">
              {programs.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => open(id)}
                    className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-(--os-accent) hover:bg-(--os-primary)/15"
                  >
                    <PixelIcon name={PROGRAMS[id].icon} className="size-5" />
                    <span className="os-pixel flex-1 text-xs uppercase text-(--os-fg)">{PROGRAMS[id].label}</span>
                    {w.open.includes(id) && <span className="os-mono text-[10px] uppercase text-(--os-muted)">open</span>}
                    <span aria-hidden className="os-mono text-(--os-muted)">›</span>
                  </button>
                </li>
              ))}
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="flex min-h-12 w-full items-center gap-3 px-3 text-(--os-accent) hover:bg-(--os-primary)/15">
                    <PixelIcon name={l.icon} className="size-5" />
                    <span className="os-pixel flex-1 text-xs uppercase text-(--os-fg)">{l.label}</span>
                    <span aria-hidden className="os-mono text-(--os-muted)">↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {w.open.map((id) => (
        <PhoneWindow
          key={id}
          title={PROGRAMS[id].label}
          hidden={w.front !== id || sheet !== null}
          onBack={w.home}
          onClose={() => w.close(id)}
        >
          <ProgramBody id={id} onDone={() => w.close(id)} />
        </PhoneWindow>
      ))}
      {sheet === "today" && (
        <PhoneSheet title="Today" onClose={() => setSheet(null)}>
          <TodayBody today={today} />
        </PhoneSheet>
      )}
      {sheet === "windows" && (
        <PhoneSheet title="Open windows" onClose={() => setSheet(null)}>
          <WindowList ids={w.open} current={w.front} onPick={open} onClose={w.close} />
        </PhoneSheet>
      )}
      <BottomBar
        openCount={w.open.length}
        windowsOpen={sheet === "windows"}
        todayOpen={sheet === "today"}
        onHome={() => {
          setSheet(null);
          w.home();
        }}
        onWindows={() => setSheet((s) => (s === "windows" ? null : "windows"))}
        onToday={() => setSheet((s) => (s === "today" ? null : "today"))}
      />
    </OsDesktop>
  );
}
