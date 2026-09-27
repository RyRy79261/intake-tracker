"use client";

// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// The shared kit the three variants are built from: the skinned desktop (a
// portal over the app, with the CRT surface), the wordmark, pixel icons, the
// phone window and sheet, the bottom bar and clock, block bars, and a
// registry of "programs" that are the REAL home cards. Looks copied from
// camp-404's 404 OS (packages/os, apps/web/components/os); no code shared.

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
import { LiquidsCard } from "@/components/liquids-card";
import { FoodSaltCard } from "@/components/food-salt-card";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { WeightCard } from "@/components/weight-card";
import { UrinationCard } from "@/components/urination-card";
import { DefecationCard } from "@/components/defecation-card";
import { TextMetrics } from "@/components/text-metrics";
import { VoicePanel } from "@/components/voice/voice-panel";
import { useDailyIntakeTotal, getDayStartTimestamp } from "@/hooks/use-intake-queries";
import { useSubstanceRecordsSince } from "@/hooks/use-substance-queries";
import { useLatestBloodPressure, useLatestWeight } from "@/hooks/use-health-queries";
import { useSettingsStore } from "@/stores/settings-store";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { useNowTick } from "@intake/ui/use-now-tick";
import { inter, silkscreen } from "@/app/_prototype-os/fonts";
import "@/app/_prototype-os/os.css";

// ---------------------------------------------------------------------------
// The desktop: a full-screen layer over the app (portalled to <body>, above
// the app header and floating bars at z-30/40, below the kit's dialogs at
// z-50), wearing the skin on <html> while it is mounted.
// ---------------------------------------------------------------------------

const noop = () => () => {};
function useIsClient() {
  return useSyncExternalStore(noop, () => true, () => false);
}

function useOsSkin() {
  useEffect(() => {
    const html = document.documentElement;
    const hadDark = html.classList.contains("dark");
    const added = ["os-skin", "dark", inter.variable, silkscreen.variable];
    html.classList.add(...added);
    return () => {
      html.classList.remove("os-skin", inter.variable, silkscreen.variable);
      if (!hadDark) html.classList.remove("dark");
    };
  }, []);
}

export function OsDesktop({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  useOsSkin();
  const client = useIsClient();
  if (!client) return null;
  return createPortal(
    <div
      data-os-desktop
      aria-label={label}
      // The app's SwipeNav swipes between routes; not from inside the OS.
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[45] overflow-hidden bg-(--os-bg) text-(--os-fg)"
    >
      {children}
    </div>,
    document.body,
  );
}

/** The CRT surface: grid, scanlines, still noise and one slow beam. */
export function Surface({ paused = false }: { paused?: boolean }) {
  return (
    <div aria-hidden data-os-paused={paused || undefined} className="pointer-events-none absolute inset-0">
      <div className="os-grid absolute inset-0" />
      <div className="os-scanlines absolute inset-0" />
      <div className="os-noise absolute inset-0 opacity-[0.06]" />
      <div className="os-scanbeam absolute inset-x-0 top-0 h-24" />
    </div>
  );
}

/** The landing's glitched wordmark, drawn by CSS (decorative). */
export function Wordmark({ text, size }: { text: string; size: string }) {
  return (
    <div
      aria-hidden
      className="os-glitch-shake relative select-none leading-none"
      style={{ "--glitch-size": size } as CSSProperties}
    >
      <span className="os-glitch-base" data-text={text} />
      <span className="os-glitch-rgb os-glitch-magenta" data-text={text} />
      <span className="os-glitch-rgb os-glitch-cyan" data-text={text} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pixel icons: one "#" per pixel, drawn three times (magenta and cyan copies
// knocked sideways under the white one), as camp-404's team icons.
// ---------------------------------------------------------------------------

export type PixelName =
  | "water"
  | "food"
  | "heart"
  | "scale"
  | "toilet"
  | "pill"
  | "chart"
  | "gear"
  | "mic"
  | "calendar"
  | "week";

const GRIDS: Record<PixelName, readonly string[]> = {
  water: [
    ".....##.....",
    ".....##.....",
    "....####....",
    "....####....",
    "...######...",
    "..########..",
    "..##.#####..",
    "..##.#####..",
    "..########..",
    "...######...",
    "....####....",
  ],
  food: [
    "...#..#..#..",
    "..#..#..#...",
    "...#..#..#..",
    "............",
    "############",
    "#..........#",
    ".#........#.",
    ".#........#.",
    "..#......#..",
    "...######...",
    "....####....",
  ],
  heart: [
    ".###...###.",
    "#####.#####",
    "###########",
    "#.##.######",
    ".#..#.####.",
    "..#####.#..",
    "...#####...",
    "....###....",
    ".....#.....",
  ],
  scale: [
    "############",
    "#..........#",
    "#...####...#",
    "#..#.#..#..#",
    "#.....#....#",
    "#..........#",
    "#..........#",
    "#..........#",
    "############",
  ],
  toilet: [
    ".####.......",
    ".#..#.......",
    ".#..#.......",
    ".####.......",
    ".##########.",
    ".#........#.",
    "..#......#..",
    "...######...",
    "....#..#....",
    "...######...",
  ],
  pill: [
    "..##########..",
    ".#.....######.",
    "#......#######",
    "#......#######",
    ".#.....######.",
    "..##########..",
  ],
  chart: [
    "#...........",
    "#.........##",
    "#.........##",
    "#......##.##",
    "#......##.##",
    "#...##.##.##",
    "#...##.##.##",
    "#.#.##.##.##",
    "#.#.##.##.##",
    "############",
  ],
  gear: [
    ".....##.....",
    "..#.####.#..",
    ".##########.",
    "..###..###..",
    ".###....###.",
    "####....####",
    "####....####",
    ".###....###.",
    "..###..###..",
    ".##########.",
    "..#.####.#..",
    ".....##.....",
  ],
  mic: [
    "....####....",
    "...######...",
    "...######...",
    "...######...",
    "...######...",
    ".#.######.#.",
    ".#..####..#.",
    "..#......#..",
    "...######...",
    ".....##.....",
    "...######...",
  ],
  calendar: [
    ".#......#...",
    "############",
    "#..........#",
    "############",
    "#..........#",
    "#.##.##.##.#",
    "#..........#",
    "#.##.##.##.#",
    "#..........#",
    "############",
  ],
  week: [
    "............",
    "#.#.#.#.#.#.",
    "............",
    "#.#.#.#.#.#.",
    "#.#.#.#.#.#.",
    "#.#.#.#.#.#.",
    "#.#.#.#.###.",
    "#.#.#.#.###.",
    "#.#.#.#.###.",
    "############",
  ],
};

function Pixels({ grid, className }: { grid: readonly string[]; className: string }) {
  return (
    <g className={className}>
      {grid.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null,
        ),
      )}
    </g>
  );
}

export function PixelIcon({ name, className = "" }: { name: PixelName; className?: string }) {
  const grid = GRIDS[name];
  const w = Math.max(...grid.map((r) => r.length));
  const h = grid.length;
  const size = Math.max(w, h);
  return (
    <svg
      viewBox={`${-(size - w) / 2 - 1} ${-(size - h) / 2 - 1} ${size + 2} ${size + 2}`}
      shapeRendering="crispEdges"
      aria-hidden
      className={`pixel-glitch ${className}`}
    >
      <Pixels grid={grid} className="pixel-glitch-m fill-[rgb(255_0_140/0.85)]" />
      <Pixels grid={grid} className="pixel-glitch-c fill-[rgb(0_220_255/0.85)]" />
      <Pixels grid={grid} className="fill-current" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Programs: the real home cards, each a window.
// ---------------------------------------------------------------------------

export type ProgramId = "water" | "food" | "bp" | "weight" | "bathroom" | "week" | "voice";

export interface Program {
  id: ProgramId;
  label: string;
  icon: PixelName;
}

export const PROGRAMS: Record<ProgramId, Program> = {
  water: { id: "water", label: "Water", icon: "water" },
  food: { id: "food", label: "Food and sodium", icon: "food" },
  bp: { id: "bp", label: "Blood pressure", icon: "heart" },
  weight: { id: "weight", label: "Weight", icon: "scale" },
  bathroom: { id: "bathroom", label: "Bathroom", icon: "toilet" },
  week: { id: "week", label: "This week", icon: "week" },
  voice: { id: "voice", label: "Voice log", icon: "mic" },
};

/** Pages of the app that are not on the home screen: links, not windows. */
export const LINKS = [
  { href: "/medications", label: "Medications", icon: "pill" },
  { href: "/analytics", label: "History", icon: "chart" },
  { href: "/settings", label: "Settings", icon: "gear" },
] as const satisfies readonly { href: string; label: string; icon: PixelName }[];

/** The body of a program's window: the real card(s), untouched. */
export function ProgramBody({ id, onDone }: { id: ProgramId; onDone?: () => void }) {
  switch (id) {
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
        <div className="space-y-4">
          <UrinationCard />
          <DefecationCard />
        </div>
      );
    case "week":
      return <TextMetrics />;
    case "voice":
      return (
        <div className="h-[70dvh]">
          <VoicePanel onCommitted={() => onDone?.()} />
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Chrome: a phone window, a sheet, the bottom bar and its clock.
// ---------------------------------------------------------------------------

const BACK_GLYPH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter" aria-hidden className="size-5 shrink-0">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

/**
 * A program full screen, above the bottom bar: the magenta title bar with a
 * big Back on the left (home, the window stays open), the plain name, and
 * Close on the right. The body is the real card and nothing else: no
 * texture inside a window.
 */
export function PhoneWindow({
  title,
  hidden,
  onBack,
  onClose,
  children,
}: {
  title: string;
  hidden?: boolean;
  onBack: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!hidden) ref.current?.focus({ preventScroll: true });
  }, [hidden]);
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Esc goes home, as the OS window does
    <section
      ref={ref}
      hidden={hidden}
      tabIndex={-1}
      aria-roledescription="window"
      aria-label={title}
      data-os-window={title}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        const t = e.target as HTMLElement;
        if (t.closest("input, textarea, select, [contenteditable='true']")) return;
        e.stopPropagation();
        onBack();
      }}
      className="os-window-in absolute inset-x-0 top-0 bottom-(--os-bar-h) z-10 flex flex-col border-t border-(--os-primary) bg-(--os-panel) outline-none"
    >
      <div className="flex h-12 shrink-0 select-none items-center gap-2 border-b border-(--os-primary) bg-(--os-primary) text-(--os-primary-fg)">
        <button
          type="button"
          onClick={onBack}
          aria-label={`Back to home, keep ${title} open`}
          className="os-pixel flex h-12 min-w-11 shrink-0 items-center gap-1 pl-2 pr-3 text-xs uppercase hover:bg-(--os-bg)/30"
        >
          {BACK_GLYPH}
          Home
        </button>
        <span className="os-pixel min-w-0 flex-1 truncate text-center text-sm uppercase tracking-[0.15em]">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="grid h-12 w-[4.75rem] shrink-0 place-items-center text-2xl leading-none hover:bg-(--os-bg)/30"
        >
          <span aria-hidden className="os-mono">×</span>
        </button>
      </div>
      <div data-os-body className="min-h-0 flex-1 select-text overflow-y-auto overscroll-contain p-3 pb-8">
        {children}
      </div>
    </section>
  );
}

/** A sheet over the home screen: Today, the open-windows list. */
export function PhoneSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Esc closes the sheet
    <section
      ref={ref}
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.stopPropagation();
          onClose();
        }
      }}
      className="os-window-in absolute inset-x-0 top-0 bottom-(--os-bar-h) z-20 flex flex-col border-t border-(--os-primary) bg-(--os-panel) outline-none"
    >
      <div className="flex h-12 shrink-0 select-none items-center gap-2 border-b border-(--os-primary) bg-(--os-primary) pr-1 text-(--os-primary-fg)">
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="os-pixel flex h-12 min-w-11 shrink-0 items-center gap-1 pl-2 pr-3 text-xs uppercase hover:bg-(--os-bg)/30"
        >
          {BACK_GLYPH}
          Back
        </button>
        <span className="os-pixel min-w-0 flex-1 truncate text-center text-sm uppercase tracking-[0.15em]">
          {title}
        </span>
        <span aria-hidden className="w-[4.75rem] shrink-0" />
      </div>
      <div data-os-body className="min-h-0 flex-1 select-text overflow-y-auto overscroll-contain">
        {children}
      </div>
    </section>
  );
}

const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** The current minute, re-rendering only its reader; blank on the server. */
export function useMinute(): Date | null {
  const client = useIsClient();
  const tick = useNowTick();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (client ? new Date() : null), [client, tick]);
}

export function dayLabel(d: Date): string {
  return DAY.format(d).toUpperCase();
}

export function Clock() {
  const now = useMinute();
  return (
    <time
      dateTime={now?.toISOString()}
      className="os-mono flex h-12 flex-col items-center justify-center border border-(--os-line) bg-(--os-bg) leading-none text-(--os-fg)"
    >
      <span className="text-[13px]">{now ? CLOCK.format(now) : ""}</span>
      <span className="mt-0.5 text-[9px] uppercase text-(--os-muted)">{now ? DAY.format(now) : ""}</span>
    </time>
  );
}

/** The bottom bar in place of a taskbar: Home, Open windows, Today, the clock. */
export function BottomBar({
  openCount,
  windowsOpen,
  todayOpen,
  onHome,
  onWindows,
  onToday,
  windowsLabel = "Windows",
}: {
  openCount: number;
  windowsOpen: boolean;
  todayOpen: boolean;
  onHome: () => void;
  onWindows: () => void;
  onToday: () => void;
  windowsLabel?: string;
}) {
  const cell =
    "os-pixel relative flex h-12 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 border text-[10px] uppercase outline-none";
  const idle = "border-(--os-line) bg-(--os-panel) text-(--os-fg)";
  const on = "border-(--os-primary) bg-(--os-primary) text-(--os-bg)";
  return (
    <div
      role="toolbar"
      aria-label="Bottom bar"
      className="absolute inset-x-0 bottom-0 z-30 flex h-(--os-bar-h) select-none items-start gap-1 border-t border-(--os-primary)/60 bg-(--os-chrome) px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
    >
      <button type="button" onClick={onHome} aria-label="Home" className={`${cell} ${idle}`}>
        <span aria-hidden className="os-chromatic os-mono text-xs font-bold">
          H<sub className="text-[8px]">2</sub>O
        </span>
        Home
      </button>
      <button
        type="button"
        onClick={onWindows}
        aria-expanded={windowsOpen}
        aria-label={`${windowsLabel}, ${openCount}`}
        className={`${cell} ${windowsOpen ? on : idle}`}
      >
        <span aria-hidden className="os-mono grid h-4 min-w-5 place-items-center border border-current px-0.5 text-[11px] leading-none">
          {openCount}
        </span>
        {windowsLabel}
      </button>
      <button
        type="button"
        onClick={onToday}
        aria-expanded={todayOpen}
        aria-label="Today"
        className={`${cell} ${todayOpen ? on : idle}`}
      >
        <PixelIcon name="calendar" className="size-4" />
        Today
      </button>
      <div className="relative min-w-0 flex-1">
        <Clock />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today: the day's totals against the limits, as square block bars.
// ---------------------------------------------------------------------------

export interface Meter {
  key: string;
  label: string;
  value: number;
  limit: number;
  unit: string;
  /** A soft target (potassium): more is fine, never "over". */
  target?: boolean;
}

export interface Today {
  meters: Meter[];
  water: Meter;
  sodium: Meter;
  caffeineMg: number;
  alcoholDrinks: number;
  bp: { systolic: number; diastolic: number; heartRate?: number; timestamp: number } | null;
  weight: { weight: number; timestamp: number } | null;
}

export function useToday(): Today {
  const waterLimit = useSettingsStore((s) => s.waterLimit);
  const saltLimit = useSettingsStore((s) => s.saltLimit);
  const sugarLimit = useSettingsStore((s) => s.sugarLimit);
  const potassiumLimit = useSettingsStore((s) => s.potassiumLimit);
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const sugarOn = useOptionalTrackerEnabled("sugar");
  const potassiumOn = useOptionalTrackerEnabled("potassium");
  const water = useDailyIntakeTotal("water") ?? 0;
  const salt = useDailyIntakeTotal("salt") ?? 0;
  const sugar = useDailyIntakeTotal("sugar") ?? 0;
  const potassium = useDailyIntakeTotal("potassium") ?? 0;
  const tick = useNowTick();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dayStart = useMemo(() => getDayStartTimestamp(dayStartHour), [dayStartHour, tick]);
  const caffeine = useSubstanceRecordsSince(dayStart, "caffeine");
  const alcohol = useSubstanceRecordsSince(dayStart, "alcohol");
  const bp = useLatestBloodPressure();
  const weight = useLatestWeight();

  const waterM: Meter = { key: "water", label: "Water", value: water, limit: waterLimit, unit: "ml" };
  const sodiumM: Meter = { key: "sodium", label: "Sodium", value: salt, limit: saltLimit, unit: "mg" };
  const meters: Meter[] = [waterM, sodiumM];
  if (sugarOn) meters.push({ key: "sugar", label: "Sugar", value: sugar, limit: sugarLimit, unit: "g" });
  if (potassiumOn)
    meters.push({ key: "potassium", label: "Potassium", value: potassium, limit: potassiumLimit, unit: "mg", target: true });

  return {
    meters,
    water: waterM,
    sodium: sodiumM,
    caffeineMg: caffeine.reduce((s, r) => s + (r.amountMg ?? 0), 0),
    alcoholDrinks: alcohol.reduce((s, r) => s + (r.amountStandardDrinks ?? 0), 0),
    bp: bp ?? null,
    weight: weight ?? null,
  };
}

export const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-GB");

/** How long ago, in plain words. */
export function ago(ts: number, now: Date | null): string {
  if (!now) return "";
  const mins = Math.max(0, Math.round((now.getTime() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** A square bar cut into blocks; over the limit it turns the warning red. */
export function BlockBar({
  meter,
  segments = 20,
  compact = false,
}: {
  meter: Meter;
  segments?: number;
  compact?: boolean;
}) {
  const { label, value, limit, unit, target } = meter;
  const ratio = limit > 0 ? value / limit : 0;
  const over = !target && ratio > 1;
  const filled = Math.round(Math.min(Math.max(ratio, 0), 1) * segments);
  const fill = over ? "bg-(--os-danger)" : target ? "bg-(--os-accent)" : ratio >= 0.85 ? "bg-(--os-primary)" : "bg-(--os-fg)";
  const text = `${fmt(value)} / ${fmt(limit)} ${unit}`;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="os-pixel text-[10px] uppercase tracking-wider text-(--os-muted)">{label}</span>
        <span className="os-mono text-xs tabular-nums text-(--os-fg)">
          {text}
          {over && <span className="ml-1.5 text-(--os-danger)">over</span>}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={value}
        aria-valuetext={text}
        className={`flex gap-[2px] border border-(--os-line) bg-(--os-bg) p-[2px] ${compact ? "h-3" : "h-4"}`}
      >
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={`h-full flex-1 ${i < filled ? fill : "bg-(--os-fg)/[0.06]"}`} />
        ))}
      </div>
    </div>
  );
}

/** A plain reading row: "Blood pressure  124/82  2 h ago". */
export function Reading({ label, value, when }: { label: string; value: string; when?: string | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-(--os-line)/60 py-2 first:border-t-0">
      <span className="os-pixel text-[10px] uppercase tracking-wider text-(--os-muted)">{label}</span>
      <span className="text-sm text-(--os-fg)">
        <span className="os-mono tabular-nums">{value}</span>
        {when && <span className="ml-2 text-xs text-(--os-muted)">{when}</span>}
      </span>
    </div>
  );
}

/** Today's panel: the heading strip, the bars, the last readings. */
export function TodayBody({ today }: { today: Today }) {
  const now = useMinute();
  return (
    <div className="p-3">
      <div className="border border-(--os-line) bg-(--os-bg)/60">
        <div className="os-pixel border-b border-(--os-line) px-3 py-2 text-xs uppercase tracking-[0.2em] text-(--os-accent-text)">
          Today · {now ? dayLabel(now) : ""}
        </div>
        <div className="space-y-3 p-3">
          {today.meters.map((m) => (
            <BlockBar key={m.key} meter={m} />
          ))}
        </div>
        <div className="border-t border-(--os-line) px-3 py-1">
          <Reading
            label="Blood pressure"
            value={today.bp ? `${today.bp.systolic}/${today.bp.diastolic}` : "none yet"}
            when={today.bp ? ago(today.bp.timestamp, now) : undefined}
          />
          <Reading
            label="Weight"
            value={today.weight ? `${fmt(today.weight.weight)} kg` : "none yet"}
            when={today.weight ? ago(today.weight.timestamp, now) : undefined}
          />
          <Reading label="Caffeine" value={`${fmt(today.caffeineMg)} mg`} />
          <Reading label="Alcohol" value={`${fmt(today.alcoholDrinks)} drinks`} />
        </div>
      </div>
    </div>
  );
}

/** The open-windows list: each by its plain name, to go to or close. */
export function WindowList({
  ids,
  current,
  onPick,
  onClose,
}: {
  ids: readonly ProgramId[];
  current: ProgramId | null;
  onPick: (id: ProgramId) => void;
  onClose: (id: ProgramId) => void;
}) {
  if (ids.length === 0) {
    return (
      <p className="p-5 text-sm text-(--os-muted)">
        Nothing is open. What you open stays here until you close it.
      </p>
    );
  }
  return (
    <div className="p-3">
      <ul aria-label="Open windows" className="flex flex-col divide-y divide-(--os-line) border border-(--os-line) bg-(--os-bg)/60">
        {ids.map((id) => (
          <li key={id} className="flex items-stretch">
            <button
              type="button"
              onClick={() => onPick(id)}
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 text-left text-(--os-accent) hover:bg-(--os-primary)/15"
            >
              <PixelIcon name={PROGRAMS[id].icon} className="size-6" />
              <span className="os-pixel truncate text-xs uppercase text-(--os-fg)">{PROGRAMS[id].label}</span>
              {current === id && (
                <span className="os-mono ml-auto shrink-0 text-[10px] uppercase text-(--os-muted)">On screen</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onClose(id)}
              aria-label={`Close ${PROGRAMS[id].label}`}
              className="grid w-14 shrink-0 place-items-center text-xl text-(--os-muted) hover:text-(--os-primary)"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A group label with a hairline, above a grid of icons. */
export function GroupLabel({ children }: { children: string }) {
  return (
    <h2 className="os-mono mb-1.5 flex items-center gap-2 px-1 text-[10px] font-normal uppercase tracking-[0.3em] text-(--os-muted)">
      {children}
      <span aria-hidden className="h-px flex-1 bg-(--os-line)/60" />
    </h2>
  );
}

/** A big icon: the picture over a pixel label, the whole cell a 64x80 target. */
export function BigIcon({
  label,
  icon,
  open = false,
  onOpen,
  href,
}: {
  label: string;
  icon: PixelName;
  open?: boolean;
  onOpen?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <PixelIcon
        name={icon}
        className={`size-11 ${open ? "text-(--os-primary) drop-shadow-[0_0_8px_var(--os-primary)]" : ""}`}
      />
      <span
        aria-hidden
        className={`os-pixel line-clamp-2 max-w-full px-1 py-0.5 text-center text-[10px] uppercase leading-tight ${
          open ? "bg-(--os-primary) text-(--os-bg)" : "bg-(--os-chrome)/80 text-(--os-fg)"
        }`}
      >
        {label}
      </span>
    </>
  );
  const cls =
    "group relative flex min-h-20 w-full min-w-16 flex-col items-center gap-1.5 px-0.5 py-1.5 text-(--os-accent) outline-none hover:text-(--os-primary) focus-visible:outline-2 focus-visible:outline-(--os-primary)";
  if (href) {
    return (
      <Link href={href} aria-label={label} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onOpen} aria-label={`Open ${label}`} className={cls}>
      {inner}
    </button>
  );
}

/** Open-window bookkeeping shared by the variants that open full screen. */
export function useWindows() {
  const [open, setOpen] = useState<ProgramId[]>([]);
  const [front, setFront] = useState<ProgramId | null>(null);
  return {
    open,
    front,
    show(id: ProgramId) {
      setOpen((o) => (o.includes(id) ? o : [...o, id]));
      setFront(id);
    },
    home() {
      setFront(null);
    },
    close(id: ProgramId) {
      setOpen((o) => o.filter((x) => x !== id));
      setFront((f) => (f === id ? null : f));
    },
  };
}
