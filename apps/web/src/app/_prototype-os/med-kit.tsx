"use client";

// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// The shell for variants D and E: an app with windows, in a calm clinical
// skin that follows the app's light/dark theme. Several windows can be open
// at once and keep their state; on a phone one shows at a time with instant
// switching (the tab strip, a swipe on the title bar, or the Windows list),
// on a wider screen they sit side by side next to the dashboard. The bottom
// bar holds Home, Windows, Today and a hold-to-talk voice button (or Sign
// in). No splash, no transitions, no computer theatre. The window bodies are
// the REAL home cards.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  Droplets,
  House,
  Layers,
  LogIn,
  Mic,
  Pill,
  Scale,
  Settings,
  Toilet,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import { LiquidsCard } from "@/components/liquids-card";
import { FoodSaltCard } from "@/components/food-salt-card";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { WeightCard } from "@/components/weight-card";
import { UrinationCard } from "@/components/urination-card";
import { DefecationCard } from "@/components/defecation-card";
import { TextMetrics, bucketByLogicalDay, getLogicalWeek } from "@/components/text-metrics";
import { VoicePanel, type VoiceRecording } from "@/components/voice/voice-panel";
import { useAuthGate } from "@/components/auth-guard";
import { useIntakeRecordsByDateRange } from "@/hooks/use-intake-queries";
import { useUrinationRecords } from "@/hooks/use-urination-queries";
import { useSettingsStore } from "@/stores/settings-store";
import { useNowTick } from "@intake/ui/use-now-tick";
import { ago, fmt, useMinute, useToday, type Meter, type Today } from "@/app/_prototype-os/os-kit";
import { useHoldToRecord } from "@/app/_prototype-os/use-hold-to-record";
import { inter } from "@/app/_prototype-os/fonts";
import "@/app/_prototype-os/med.css";

// ---------------------------------------------------------------------------
// Domains: one restrained colour each (med.css), used for accent, icon, fill.
// ---------------------------------------------------------------------------

export type Domain =
  | "water"
  | "sodium"
  | "sugar"
  | "potassium"
  | "bp"
  | "weight"
  | "bathroom"
  | "meds"
  | "voice"
  | "caffeine"
  | "alcohol"
  | "neutral";

export const tone = (d: Domain) => `hsl(var(--d-${d}))`;
export const tint = (d: Domain, a = 0.12) => `hsl(var(--d-${d}) / ${a})`;

export type WinId = "today" | "water" | "food" | "bp" | "weight" | "bathroom" | "week" | "voice";

export const WINDOWS: Record<WinId, { label: string; domain: Domain; icon: LucideIcon }> = {
  today: { label: "Today", domain: "neutral", icon: CalendarDays },
  water: { label: "Water", domain: "water", icon: Droplets },
  food: { label: "Food & sodium", domain: "sodium", icon: Utensils },
  bp: { label: "Blood pressure", domain: "bp", icon: Activity },
  weight: { label: "Weight", domain: "weight", icon: Scale },
  bathroom: { label: "Bathroom", domain: "bathroom", icon: Toilet },
  week: { label: "This week", domain: "neutral", icon: BarChart3 },
  voice: { label: "Voice log", domain: "voice", icon: Mic },
};

export const PAGES = [
  { href: "/medications", label: "Medications", domain: "meds" as Domain, icon: Pill },
  { href: "/analytics", label: "History", domain: "neutral" as Domain, icon: BarChart3 },
  { href: "/settings", label: "Settings", domain: "neutral" as Domain, icon: Settings },
];

const METER_DOMAIN: Record<string, Domain> = {
  water: "water",
  sodium: "sodium",
  sugar: "sugar",
  potassium: "potassium",
};
export const meterDomain = (m: Meter): Domain => METER_DOMAIN[m.key] ?? "neutral";
/** Which window a metric opens. */
export const meterWindow = (m: Meter): WinId => (m.key === "water" ? "water" : "food");

// ---------------------------------------------------------------------------
// The desktop: a full-screen layer over the app, following its theme.
// ---------------------------------------------------------------------------

const noop = () => () => {};
function useIsClient() {
  return useSyncExternalStore(noop, () => true, () => false);
}

function MedDesktop({ label, children }: { label: string; children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("med-skin", inter.variable);
    return () => html.classList.remove("med-skin", inter.variable);
  }, []);
  const client = useIsClient();
  if (!client) return null;
  return createPortal(
    <div
      aria-label={label}
      // The app's SwipeNav swipes between routes; not from inside here.
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[45] overflow-hidden bg-[hsl(var(--med-desk))] text-foreground"
    >
      {children}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Plain-language helpers.
// ---------------------------------------------------------------------------

/** "of 1,000 ml limit · 750 ml left", "150 ml over the 1,000 ml limit". */
export function meterHint(m: Meter): string {
  if (m.target) {
    const left = m.limit - m.value;
    return left > 0 ? `of ${fmt(m.limit)} ${m.unit} daily target · ${fmt(left)} to go` : `daily target of ${fmt(m.limit)} ${m.unit} reached`;
  }
  if (m.value > m.limit) return `${fmt(m.value - m.limit)} ${m.unit} over the ${fmt(m.limit)} ${m.unit} limit`;
  return `of ${fmt(m.limit)} ${m.unit} limit · ${fmt(m.limit - m.value)} ${m.unit} left`;
}

/** One line per window, live: what the window holds right now. */
export function useSummaries(today: Today, voiceState: string): Record<WinId, string> {
  const now = useMinute();
  const pee = useUrinationRecords(1);
  const last = pee[0];
  const sodium = today.sodium;
  return {
    today: `Water ${fmt(today.water.value)} ml · sodium ${fmt(sodium.value)} mg`,
    water: `${fmt(today.water.value)} of ${fmt(today.water.limit)} ml today`,
    food: `${fmt(sodium.value)} of ${fmt(sodium.limit)} mg sodium today`,
    bp: today.bp ? `Last ${today.bp.systolic}/${today.bp.diastolic} mmHg, ${ago(today.bp.timestamp, now)}` : "No reading yet",
    weight: today.weight ? `Last ${fmt(today.weight.weight)} kg, ${ago(today.weight.timestamp, now)}` : "No weight yet",
    bathroom: last ? `Last visit ${ago(last.timestamp, now)}` : "Nothing logged yet",
    week: "Water and sodium, this week",
    voice: voiceState,
  };
}

// ---------------------------------------------------------------------------
// Small pieces.
// ---------------------------------------------------------------------------

export function SmallCaps({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground ${className}`}>
      {children}
    </span>
  );
}

/** A thin, square progress bar in the domain colour. */
export function Bar({ meter, domain, className = "" }: { meter: Meter; domain: Domain; className?: string }) {
  const ratio = meter.limit > 0 ? meter.value / meter.limit : 0;
  const over = !meter.target && ratio > 1;
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div
      role="meter"
      aria-label={meter.label}
      aria-valuemin={0}
      aria-valuemax={meter.limit}
      aria-valuenow={meter.value}
      aria-valuetext={`${fmt(meter.value)} ${meter.unit}, ${meterHint(meter)}`}
      className={`h-1.5 w-full bg-muted ${className}`}
    >
      <div className="h-full" style={{ width: `${pct}%`, background: over ? "hsl(var(--destructive))" : tone(domain) }} />
    </div>
  );
}

/** A metric: its name, today's figure, the bar, and what the figure means. */
export function MeterRow({ meter, onOpen }: { meter: Meter; onOpen: () => void }) {
  const d = meterDomain(meter);
  const over = !meter.target && meter.value > meter.limit;
  return (
    <button type="button" onClick={onOpen} aria-label={`Open ${WINDOWS[meterWindow(meter)].label}`} className="block w-full px-4 py-3 text-left hover:bg-muted/50">
      <span className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span aria-hidden className="size-2" style={{ background: tone(d) }} />
          {meter.label}
        </span>
        <span data-med-num className="text-base font-semibold">
          {fmt(meter.value)} <span className="text-xs font-normal text-muted-foreground">{meter.unit}</span>
        </span>
      </span>
      <Bar meter={meter} domain={d} className="mt-2" />
      <span className={`mt-1.5 block text-xs ${over ? "text-destructive" : "text-muted-foreground"}`}>{meterHint(meter)}</span>
    </button>
  );
}

/** A widget: a hairline panel with a small-caps heading and optional action. */
export function Widget({
  title,
  action,
  onAction,
  children,
  className = "",
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={`border border-border bg-card ${className}`}>
      <div className="flex h-9 items-center justify-between border-b border-border px-4">
        <SmallCaps>{title}</SmallCaps>
        {action && onAction && (
          <button type="button" onClick={onAction} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            {action} ›
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** Water and sodium for the logical week, a column per day. */
export function useWeek() {
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const tick = useNowTick();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const week = useMemo(() => getLogicalWeek(new Date(), dayStartHour), [dayStartHour, tick]);
  const water = useIntakeRecordsByDateRange(week.start, week.end, "water");
  const salt = useIntakeRecordsByDateRange(week.start, week.end, "salt");
  return {
    todayIndex: week.todayIndex,
    dayKeys: week.dayKeys,
    water: bucketByLogicalDay(water, week.dayKeys, dayStartHour, (r) => r.amount),
    sodium: bucketByLogicalDay(salt, week.dayKeys, dayStartHour, (r) => r.amount),
  };
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "narrow" });

/** Seven thin columns against a dashed limit line. */
export function WeekColumns({
  label,
  values,
  limit,
  unit,
  domain,
  todayIndex,
  dayKeys,
}: {
  label: string;
  values: number[];
  limit: number;
  unit: string;
  domain: Domain;
  todayIndex: number;
  dayKeys: string[];
}) {
  const top = Math.max(limit * 1.25, ...values, 1);
  const avgDays = values.slice(0, todayIndex + 1);
  const avg = avgDays.reduce((a, b) => a + b, 0) / Math.max(1, avgDays.length);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span data-med-num className="text-xs text-muted-foreground">
          avg {fmt(Math.round(avg))} {unit} a day · limit {fmt(limit)}
        </span>
      </div>
      <div className="relative mt-2 flex h-14 items-end gap-1.5">
        <div aria-hidden className="absolute inset-x-0 border-t border-dashed border-muted-foreground/50" style={{ bottom: `${(limit / top) * 100}%` }} />
        {values.map((v, i) => (
          <div key={dayKeys[i] ?? i} className="flex h-full flex-1 flex-col justify-end">
            <div
              className="w-full"
              style={{
                height: `${Math.max(v > 0 ? 3 : 1, (v / top) * 100)}%`,
                background: v > limit ? "hsl(var(--destructive))" : i > todayIndex ? "transparent" : tone(domain),
                opacity: i === todayIndex ? 1 : 0.55,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {dayKeys.map((k, i) => (
          <span key={k} className={`flex-1 text-center text-[10px] ${i === todayIndex ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            {WEEKDAY.format(new Date(`${k}T12:00:00`))}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A launcher tile: the domain's icon on a tinted square, the plain name. */
export function AppTile({
  label,
  icon: Icon,
  domain,
  open,
  onOpen,
  href,
}: {
  label: string;
  icon: LucideIcon;
  domain: Domain;
  open?: boolean;
  onOpen?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <span className="relative grid size-12 place-items-center border border-border" style={{ background: tint(domain), color: tone(domain) }}>
        <Icon aria-hidden className="size-5" strokeWidth={1.75} />
        {open && <span aria-hidden className="absolute -right-1 -top-1 size-2.5 border-2 border-card" style={{ background: tone(domain) }} />}
      </span>
      <span className="line-clamp-2 text-center text-[11.5px] leading-tight">{label}</span>
    </>
  );
  const cls = "flex min-h-20 flex-col items-center gap-1.5 px-1 py-2 hover:bg-muted/60";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onOpen} aria-label={open ? `${label}, open` : `Open ${label}`} className={cls}>
      {inner}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Window bodies: the real cards.
// ---------------------------------------------------------------------------

function TodayDetail({ today }: { today: Today }) {
  const now = useMinute();
  return (
    <div className="space-y-4">
      <div className="divide-y divide-border border border-border">
        {today.meters.map((m) => (
          <div key={m.key} className="px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">{m.label}</span>
              <span data-med-num className="text-base font-semibold">
                {fmt(m.value)} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span>
              </span>
            </div>
            <Bar meter={m} domain={meterDomain(m)} className="mt-2" />
            <p className="mt-1.5 text-xs text-muted-foreground">{meterHint(m)}</p>
          </div>
        ))}
      </div>
      <dl className="divide-y divide-border border border-border text-sm">
        {[
          ["Blood pressure", today.bp ? `${today.bp.systolic}/${today.bp.diastolic} mmHg` : "No reading yet", today.bp ? `last reading ${ago(today.bp.timestamp, now)}` : ""],
          ["Weight", today.weight ? `${fmt(today.weight.weight)} kg` : "No weight yet", today.weight ? `last weighed ${ago(today.weight.timestamp, now)}` : ""],
          ["Caffeine", `${fmt(today.caffeineMg)} mg`, "today"],
          ["Alcohol", `${fmt(today.alcoholDrinks)} standard drinks`, "today"],
        ].map(([k, v, hint]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <dt className="text-muted-foreground">{k}</dt>
            <dd data-med-num className="text-right">
              {v}
              {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Limits and targets are set in <Link href="/settings" className="underline">Settings</Link>. The day starts at the hour set there.
      </p>
    </div>
  );
}

function WinBody({
  id,
  today,
  recording,
  onVoiceDone,
}: {
  id: WinId;
  today: Today;
  recording: VoiceRecording | null;
  onVoiceDone: () => void;
}) {
  switch (id) {
    case "today":
      return <TodayDetail today={today} />;
    case "water":
      return <LiquidsCard />;
    case "food":
      return <FoodSaltCard />;
    case "bp":
      return <BloodPressureCard />;
    case "weight":
      return <WeightCard />;
    case "bathroom":
      return (
        <div className="space-y-6">
          <UrinationCard />
          <DefecationCard />
        </div>
      );
    case "week":
      return <TextMetrics />;
    case "voice":
      return (
        <div className="h-[calc(100dvh-12rem)] min-h-96">
          <VoicePanel initialRecording={recording} onCommitted={onVoiceDone} />
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// A window.
// ---------------------------------------------------------------------------

function MedWindow({
  id,
  front,
  summary,
  onFocus,
  onHome,
  onClose,
  onSwipe,
  children,
}: {
  id: WinId;
  front: boolean;
  summary: string;
  onFocus: () => void;
  onHome: () => void;
  onClose: () => void;
  onSwipe: (dir: 1 | -1) => void;
  children: ReactNode;
}) {
  const { label, domain, icon: Icon } = WINDOWS[id];
  const swipe = useRef<number | null>(null);
  return (
    <section
      id={`med-win-${id}`}
      aria-label={label}
      data-med-window={id}
      onFocusCapture={onFocus}
      onPointerDownCapture={onFocus}
      className={`absolute inset-0 flex flex-col bg-card md:relative md:inset-auto md:h-full md:w-[26rem] md:shrink-0 md:border ${
        front ? "md:border-foreground/30 md:shadow-sm" : "max-md:hidden md:border-border"
      }`}
    >
      <div
        className="flex h-12 shrink-0 select-none items-center gap-1 border-b border-border border-t-2 pr-1 touch-pan-y"
        style={{ borderTopColor: tone(domain) }}
        onPointerDown={(e) => {
          swipe.current = e.clientX;
        }}
        onPointerUp={(e) => {
          const x0 = swipe.current;
          swipe.current = null;
          if (x0 === null) return;
          const dx = e.clientX - x0;
          if (Math.abs(dx) > 60) onSwipe(dx < 0 ? 1 : -1);
        }}
      >
        <button type="button" onClick={onHome} aria-label="Back to home" className="grid h-12 w-10 shrink-0 place-items-center text-muted-foreground hover:text-foreground md:hidden">
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <Icon aria-hidden className="ml-0 size-4 shrink-0 md:ml-3" style={{ color: tone(domain) }} strokeWidth={2} />
        <div className="ml-2 min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold leading-tight">{label}</h2>
          <p data-med-num className="truncate text-[11px] leading-tight text-muted-foreground">
            {summary}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label={`Close ${label}`} className="grid size-10 shrink-0 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground">
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div data-med-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 pb-10">
        {children}
      </div>
    </section>
  );
}

/** Phone: a strip of what is open, each in its colour, tap to switch. */
function OpenStrip({
  open,
  front,
  summaries,
  onPick,
}: {
  open: WinId[];
  front: WinId | null;
  summaries: Record<WinId, string>;
  onPick: (id: WinId) => void;
}) {
  return (
    <nav aria-label="Open windows" className="flex h-11 shrink-0 gap-px overflow-x-auto border-b border-border bg-[hsl(var(--med-desk))] md:hidden">
      {open.map((id) => {
        const { label, domain } = WINDOWS[id];
        const on = id === front;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onPick(id)}
            aria-current={on || undefined}
            aria-label={`${label}: ${summaries[id]}`}
            className={`flex min-w-0 shrink-0 items-center gap-2 border-b-2 px-3 text-xs ${on ? "bg-card font-semibold" : "text-muted-foreground"}`}
            style={{ borderBottomColor: on ? tone(domain) : "transparent" }}
          >
            <span aria-hidden className="size-2 shrink-0" style={{ background: tone(domain) }} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

/** The Windows list: what is open, with a live line each; open or close. */
function WindowsSheet({
  open,
  summaries,
  onPick,
  onClose,
  onDismiss,
}: {
  open: WinId[];
  summaries: Record<WinId, string>;
  onPick: (id: WinId) => void;
  onClose: (id: WinId) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="absolute inset-x-0 top-0 bottom-(--med-bar-h) z-20 flex flex-col justify-end bg-black/30" onPointerDown={(e) => e.target === e.currentTarget && onDismiss()}>
      <section aria-label="Open windows" className="max-h-[75%] overflow-y-auto border-t border-border bg-card">
        <div className="flex h-11 items-center justify-between border-b border-border px-4">
          <SmallCaps>{open.length === 0 ? "Nothing open" : `${open.length} open`}</SmallCaps>
          <button type="button" onClick={onDismiss} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            Done
          </button>
        </div>
        {open.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">Open Water, Blood pressure or anything else from Home. Several can stay open at once, each keeps what you typed.</p>
        ) : (
          <ul className="divide-y divide-border">
            {open.map((id) => {
              const { label, domain, icon: Icon } = WINDOWS[id];
              return (
                <li key={id} className="flex items-stretch">
                  <button type="button" onClick={() => onPick(id)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 border-l-2 px-4 text-left hover:bg-muted/50" style={{ borderLeftColor: tone(domain) }}>
                    <Icon aria-hidden className="size-4 shrink-0" style={{ color: tone(domain) }} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{label}</span>
                      <span data-med-num className="block truncate text-xs text-muted-foreground">
                        {summaries[id]}
                      </span>
                    </span>
                  </button>
                  <button type="button" onClick={() => onClose(id)} aria-label={`Close ${label}`} className="w-16 shrink-0 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                    Close
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hold to talk.
// ---------------------------------------------------------------------------

const NOTICE_TEXT = {
  "too-short": "Keep holding while you speak, then let go to send.",
  cancelled: "Recording cancelled.",
  "max-length": "Stopped at 1 minute and sent.",
  error: "The microphone is not available. Check the browser's permission.",
} as const;

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function HoldToTalk({ onRecorded }: { onRecorded: (r: VoiceRecording) => void }) {
  const hold = useHoldToRecord({ onRecorded: (blob, mimeType) => onRecorded({ blob, mimeType }) });
  const { phase, notice, elapsedMs, maxMs, clearNotice } = hold;
  const active = phase === "recording" || phase === "cancel-armed" || phase === "starting";
  const armed = phase === "cancel-armed";

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clearNotice, 3500);
    return () => clearTimeout(t);
  }, [notice, clearNotice]);

  return (
    <>
      {(active || notice) && (
        <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-2 bottom-[calc(var(--med-bar-h)+0.5rem)] z-30">
          <div
            className={`flex items-center gap-3 border px-4 py-3 shadow-md ${armed ? "border-destructive bg-destructive text-destructive-foreground" : "border-border bg-card"}`}
          >
            {active ? (
              <>
                <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${armed ? "bg-destructive-foreground" : "bg-destructive motion-safe:animate-pulse"}`} />
                <span className="min-w-0 flex-1 text-sm">
                  {phase === "starting" ? "Starting the microphone…" : armed ? "Let go to cancel" : "Listening. Let go to send."}
                  {!armed && phase !== "starting" && <span className="block text-xs text-muted-foreground">Slide off the button to cancel</span>}
                </span>
                <span data-med-num className="text-sm tabular-nums">
                  {mmss(elapsedMs)} <span className={armed ? "" : "text-muted-foreground"}>/ {mmss(maxMs)}</span>
                </span>
              </>
            ) : (
              <span className="text-sm">{notice ? NOTICE_TEXT[notice] : ""}</span>
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        {...hold.bind}
        aria-label="Hold to talk: log by voice"
        aria-pressed={active}
        data-hold-phase={phase}
        className={`flex h-12 flex-[1.7] touch-none select-none items-center justify-center gap-2 border text-sm font-semibold [-webkit-touch-callout:none] ${
          armed
            ? "border-destructive bg-destructive text-destructive-foreground"
            : active
              ? "border-foreground bg-foreground text-background"
              : "border-foreground/80 bg-card text-foreground hover:bg-muted"
        }`}
      >
        <Mic aria-hidden className="size-4" />
        {active ? (armed ? "Let go to cancel" : "Listening…") : "Hold to talk"}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// The shell: dashboard + windows + bottom bar.
// ---------------------------------------------------------------------------

export interface ShellApi {
  open: WinId[];
  front: WinId | null;
  show: (id: WinId) => void;
  today: Today;
  summaries: Record<WinId, string>;
}

export function MedShell({
  label,
  dashboardWidth = "md:w-[24rem]",
  dashboard,
}: {
  label: string;
  dashboardWidth?: string;
  dashboard: (api: ShellApi) => ReactNode;
}) {
  const [open, setOpen] = useState<WinId[]>([]);
  const [front, setFront] = useState<WinId | null>(null);
  const [sheet, setSheet] = useState(false);
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const aiReady = useAuthGate();
  const today = useToday();
  const summaries = useSummaries(today, recording ? "Review what you said, then save" : "Hold to talk, or record here");
  const dashRef = useRef<HTMLDivElement>(null);

  const show = (id: WinId) => {
    setSheet(false);
    setOpen((o) => (o.includes(id) ? o : [...o, id]));
    setFront(id);
    requestAnimationFrame(() => document.getElementById(`med-win-${id}`)?.scrollIntoView({ inline: "nearest", block: "nearest" }));
  };
  const close = (id: WinId) => {
    const rest = open.filter((x) => x !== id);
    setOpen(rest);
    if (front === id) setFront(rest.at(-1) ?? null);
    if (id === "voice") setRecording(null);
  };
  const home = () => {
    setSheet(false);
    setFront(null);
    dashRef.current?.scrollTo({ top: 0 });
  };
  const step = (dir: 1 | -1) => {
    if (!front || open.length < 2) return;
    const i = open.indexOf(front);
    setFront(open[(i + dir + open.length) % open.length]!);
  };

  const api: ShellApi = { open, front, show, today, summaries };

  return (
    <MedDesktop label={label}>
      <div className="absolute inset-x-0 top-0 bottom-(--med-bar-h) flex">
        <div
          ref={dashRef}
          inert={sheet || undefined}
          className={`min-w-0 flex-1 overflow-y-auto overscroll-contain md:flex-none md:border-r md:border-border ${dashboardWidth} ${front ? "max-md:hidden" : ""}`}
        >
          {dashboard(api)}
        </div>
        <div inert={sheet || undefined} className={`min-w-0 flex-1 flex-col ${front ? "flex" : "hidden md:flex"}`}>
          {open.length > 1 && <OpenStrip open={open} front={front} summaries={summaries} onPick={setFront} />}
          <div className="relative min-h-0 flex-1 md:flex md:gap-3 md:overflow-x-auto md:p-3">
            {open.map((id) => (
              <MedWindow
                key={id}
                id={id}
                front={id === front}
                summary={summaries[id]}
                onFocus={() => setFront(id)}
                onHome={home}
                onClose={() => close(id)}
                onSwipe={step}
              >
                <WinBody id={id} today={today} recording={recording} onVoiceDone={() => close("voice")} />
              </MedWindow>
            ))}
            {open.length === 0 && (
              <p className="m-auto max-w-xs self-center p-6 text-center text-sm text-muted-foreground max-md:hidden">
                Open anything on the left. Several windows sit side by side here, and each keeps what you typed until you close it.
              </p>
            )}
          </div>
        </div>
      </div>

      {sheet && <WindowsSheet open={open} summaries={summaries} onPick={show} onClose={close} onDismiss={() => setSheet(false)} />}

      <div role="toolbar" aria-label="Bottom bar" className="absolute inset-x-0 bottom-0 z-30 flex h-(--med-bar-h) items-start gap-1.5 border-t border-border bg-card px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <BarButton label="Home" icon={House} active={!front && !sheet} onClick={home} />
        <BarButton
          label={open.length ? `${open.length} open` : "Windows"}
          ariaLabel={`Windows, ${open.length} open`}
          icon={Layers}
          active={sheet}
          onClick={() => setSheet((s) => !s)}
        />
        <BarButton label="Today" icon={CalendarDays} active={front === "today" && !sheet} onClick={() => show("today")} />
        {aiReady ? (
          <HoldToTalk
            onRecorded={(r) => {
              setRecording(r);
              show("voice");
            }}
          />
        ) : (
          <Link href="/auth" className="flex h-12 flex-[1.7] flex-col items-center justify-center border border-border text-sm font-semibold hover:bg-muted">
            <span className="flex items-center gap-2">
              <LogIn aria-hidden className="size-4" />
              Sign in
            </span>
            <span className="text-[10px] font-normal text-muted-foreground">to log by voice</span>
          </Link>
        )}
      </div>
    </MedDesktop>
  );
}

function BarButton({
  label,
  ariaLabel,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  ariaLabel?: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  const style: CSSProperties | undefined = active ? { boxShadow: "inset 0 2px 0 0 hsl(var(--foreground))" } : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      aria-pressed={active}
      style={style}
      className={`flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
      {label}
    </button>
  );
}
