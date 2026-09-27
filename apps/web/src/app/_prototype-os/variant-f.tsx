"use client";

// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// Variant F, "Existing look, as apps": the app exactly as it looks today
// (its header, colours, fonts, cards, light/dark theme), rearranged into an
// app layout. On top, the existing compact TextMetrics block, as it is. Under
// it, a launcher of the modules with the same icons and coloured chips the
// quick-nav uses. Nothing else on the home screen: it fits one phone screen.
// An app opens as a window holding the real card, unchanged; several can be
// open at once and each keeps its state (tabs at the top of the window, the
// "N open" list in the bar). The bottom bar replaces the quick-nav here:
// Home, N open, and hold-to-talk (Sign in when voice is unavailable).

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { BarChart3, ChevronLeft, House, Layers, LogIn, Mic, Pill, Settings, X, type LucideIcon } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { TextMetrics } from "@/components/text-metrics";
import { LiquidsCard } from "@/components/liquids-card";
import { FoodSaltCard } from "@/components/food-salt-card";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { WeightCard } from "@/components/weight-card";
import { UrinationCard } from "@/components/urination-card";
import { DefecationCard } from "@/components/defecation-card";
import { VoicePanel, type VoiceRecording } from "@/components/voice/voice-panel";
import { useAuthGate } from "@/components/auth-guard";
import { CARD_THEMES, type CardThemeKey } from "@/lib/card-themes";
import { QUICK_NAV_LABEL_OVERRIDES } from "@/lib/quick-nav-defaults";
import { cn } from "@/lib/utils";
import { useHoldToRecord } from "@/app/_prototype-os/use-hold-to-record";

type AppId = "liquids" | "food" | "bp" | "weight" | "urination" | "defecation" | "voice";

interface AppDef {
  label: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  /** The module's existing card border colour, for its open tab. */
  border: string;
}

/** The quick-nav's own icon, chip and label for a card theme. */
function fromTheme(key: CardThemeKey): AppDef {
  const t = CARD_THEMES[key];
  return {
    label: QUICK_NAV_LABEL_OVERRIDES[key] ?? t.label,
    icon: t.icon,
    iconBg: t.iconBg,
    iconColor: t.iconColor,
    border: t.border,
  };
}

const APPS: Record<AppId, AppDef> = {
  liquids: fromTheme("water"),
  food: fromTheme("eating"),
  bp: fromTheme("bp"),
  weight: fromTheme("weight"),
  urination: fromTheme("urination"),
  defecation: fromTheme("defecation"),
  // The existing voice bar's sky mic chip.
  voice: {
    label: "Voice log",
    icon: Mic,
    iconBg: "bg-sky-100 dark:bg-sky-900/50",
    iconColor: "text-sky-600 dark:text-sky-400",
    border: "border-sky-200 dark:border-sky-800",
  },
};

const LAUNCH: AppId[] = ["liquids", "food", "bp", "weight", "urination", "defecation"];

/** The pages that are not cards: links, with chips in the same grammar. */
const PAGES: { href: string; label: string; icon: LucideIcon; iconBg: string; iconColor: string }[] = [
  { href: "/medications", label: "Medications", icon: Pill, iconBg: "bg-teal-100 dark:bg-teal-900/50", iconColor: "text-teal-600 dark:text-teal-400" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, iconBg: "bg-slate-100 dark:bg-slate-800/60", iconColor: "text-slate-600 dark:text-slate-400" },
  { href: "/settings", label: "Settings", icon: Settings, iconBg: "bg-slate-100 dark:bg-slate-800/60", iconColor: "text-slate-600 dark:text-slate-400" },
];

function Chip({ app, size = "md" }: { app: Pick<AppDef, "icon" | "iconBg" | "iconColor">; size?: "sm" | "md" }) {
  const Icon = app.icon;
  return (
    <span className={cn(size === "sm" ? "p-1 rounded-md" : "p-2 rounded-lg", app.iconBg)}>
      <Icon aria-hidden className={cn(size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5", app.iconColor)} />
    </span>
  );
}

function AppBody({ id, recording, onVoiceDone }: { id: AppId; recording: VoiceRecording | null; onVoiceDone: () => void }) {
  switch (id) {
    case "liquids":
      return <LiquidsCard />;
    case "food":
      return <FoodSaltCard />;
    case "bp":
      return <BloodPressureCard />;
    case "weight":
      return <WeightCard />;
    case "urination":
      return <UrinationCard />;
    case "defecation":
      return <DefecationCard />;
    case "voice":
      return (
        <div className="h-[calc(100dvh-10rem)] min-h-96">
          <VoicePanel initialRecording={recording} onCommitted={onVoiceDone} />
        </div>
      );
  }
}

const noop = () => () => {};

/** Over the app's own home (its header and quick-nav), same background. */
function Layer({ children }: { children: ReactNode }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  if (!client) return null;
  return createPortal(
    <div
      // The app's SwipeNav swipes between routes; not from inside here.
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[45] flex flex-col overflow-hidden bg-linear-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 text-foreground"
    >
      {children}
    </div>,
    document.body,
  );
}

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const NOTICE = {
  "too-short": "Keep holding while you speak, then let go to send.",
  cancelled: "Recording cancelled.",
  "max-length": "Stopped at 1 minute and sent.",
  error: "Microphone not available. Check the browser's permission.",
} as const;

/** Hold-to-talk in the existing voice bar's style: the sky mic chip. */
function HoldToTalk({ onRecorded }: { onRecorded: (r: VoiceRecording) => void }) {
  const hold = useHoldToRecord({ onRecorded: (blob, mimeType) => onRecorded({ blob, mimeType }) });
  const { phase, notice, elapsedMs, maxMs, clearNotice } = hold;
  const active = phase !== "idle";
  const armed = phase === "cancel-armed";
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clearNotice, 3500);
    return () => clearTimeout(t);
  }, [notice, clearNotice]);
  return (
    <>
      {(active || notice) && (
        <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-4 bottom-full mb-2">
          <div className={cn("mx-auto max-w-lg rounded-xl border bg-card px-4 py-3 text-sm shadow-lg", armed && "border-red-300 dark:border-red-800")}>
            {active ? (
              <div className="flex items-center gap-3">
                <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full bg-red-500", !armed && "motion-safe:animate-pulse")} />
                <span className="flex-1">
                  {phase === "starting" ? "Starting the microphone…" : armed ? "Let go to cancel" : "Listening. Let go to send."}
                  {!armed && phase !== "starting" && <span className="block text-xs text-muted-foreground">Slide off the button to cancel</span>}
                </span>
                <span className="tabular-nums">
                  {mmss(elapsedMs)} <span className="text-muted-foreground">/ {mmss(maxMs)}</span>
                </span>
              </div>
            ) : (
              notice && NOTICE[notice]
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
        className={cn(
          "flex h-12 flex-[2] touch-none select-none items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors [-webkit-touch-callout:none]",
          armed
            ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300"
            : active
              ? "border-sky-300 bg-sky-50 text-foreground dark:border-sky-700 dark:bg-sky-950/50"
              : "bg-card text-muted-foreground hover:bg-muted/40",
        )}
      >
        <span className={cn("p-1.5 rounded-lg", armed ? "bg-red-100 dark:bg-red-900/50" : "bg-sky-100 dark:bg-sky-900/50")}>
          <Mic aria-hidden className={cn("h-4 w-4", armed ? "text-red-600 dark:text-red-400" : "text-sky-600 dark:text-sky-400")} />
        </span>
        {armed ? "Let go to cancel" : active ? "Listening…" : "Hold to talk"}
      </button>
    </>
  );
}

export function VariantF() {
  const [open, setOpen] = useState<AppId[]>([]);
  const [front, setFront] = useState<AppId | null>(null);
  const [list, setList] = useState(false);
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const aiReady = useAuthGate();

  const show = (id: AppId) => {
    setList(false);
    setOpen((o) => (o.includes(id) ? o : [...o, id]));
    setFront(id);
  };
  const close = (id: AppId) => {
    const rest = open.filter((x) => x !== id);
    setOpen(rest);
    if (front === id) setFront(rest.at(-1) ?? null);
    if (id === "voice") setRecording(null);
  };
  const home = () => {
    setList(false);
    setFront(null);
  };

  return (
    <Layer>
      {/* Home: the header, the metrics block, the apps. One screen. */}
      <div hidden={front !== null} className="min-h-0 flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-lg px-4 pt-6 pb-4">
          <AppHeader />
          <div className="mb-4">
            <TextMetrics />
          </div>
          <nav aria-label="Apps" className="grid grid-cols-3 gap-2">
            {LAUNCH.map((id) => {
              const app = APPS[id];
              const isOpen = open.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => show(id)}
                  aria-label={isOpen ? `${app.label}, open` : `Open ${app.label}`}
                  className="relative flex h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border bg-card transition-colors hover:bg-muted/60 active:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Chip app={app} />
                  <span className="text-xs font-medium leading-tight">{app.label}</span>
                  {isOpen && <span aria-hidden className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />}
                </button>
              );
            })}
            {PAGES.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="flex h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border bg-card transition-colors hover:bg-muted/60 active:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Chip app={p} />
                <span className="text-xs font-medium leading-tight">{p.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Windows: the open apps, each the real card; only the front shows. */}
      {front !== null && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b bg-linear-to-b from-slate-50 to-slate-50/95 dark:from-slate-950 dark:to-slate-950/95">
            <div className="container mx-auto flex max-w-lg items-center gap-1 px-2 py-2">
              <button type="button" onClick={home} aria-label="Back to home" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted/80">
                <ChevronLeft aria-hidden className="h-5 w-5" />
              </button>
              <nav aria-label="Open apps" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
                {open.map((id) => {
                  const app = APPS[id];
                  const on = id === front;
                  return (
                    <span key={id} className={cn("flex shrink-0 items-center rounded-lg border", on ? cn("bg-card shadow-xs", app.border) : "border-transparent")}>
                      <button
                        type="button"
                        onClick={() => setFront(id)}
                        aria-current={on || undefined}
                        className={cn("flex h-9 items-center gap-1.5 pl-1.5 pr-2 text-xs font-medium", on ? "text-foreground" : "text-muted-foreground")}
                      >
                        <Chip app={app} size="sm" />
                        {app.label}
                      </button>
                      {on && (
                        <button type="button" onClick={() => close(id)} aria-label={`Close ${app.label}`} className="grid h-9 w-7 place-items-center text-muted-foreground hover:text-foreground">
                          <X aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </nav>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="container mx-auto max-w-lg px-4 py-4">
              {open.map((id) => (
                <section key={id} aria-label={APPS[id].label} data-app-window={id} hidden={id !== front}>
                  <AppBody id={id} recording={recording} onVoiceDone={() => close("voice")} />
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* The "N open" list. */}
      {list && (
        <div className="absolute inset-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-10 flex flex-col justify-end bg-black/30" onPointerDown={(e) => e.target === e.currentTarget && setList(false)}>
          <section aria-label="Open apps" className="container mx-auto max-w-lg px-4 pb-3">
            <div className="rounded-xl border bg-card shadow-lg">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="text-sm font-semibold">{open.length === 0 ? "Nothing open" : `${open.length} open`}</span>
                <button type="button" onClick={() => setList(false)} className="text-sm text-muted-foreground hover:text-foreground">
                  Done
                </button>
              </div>
              {open.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">Open apps from Home. Several can stay open at once, and each keeps what you entered.</p>
              ) : (
                <ul className="divide-y">
                  {open.map((id) => {
                    const app = APPS[id];
                    return (
                      <li key={id} className="flex items-center">
                        <button type="button" onClick={() => show(id)} className="flex min-h-14 flex-1 items-center gap-3 px-4 text-left text-sm font-medium hover:bg-muted/40">
                          <Chip app={app} />
                          {app.label}
                          {id === front && <span className="ml-auto text-xs font-normal text-muted-foreground">On screen</span>}
                        </button>
                        <button type="button" onClick={() => close(id)} aria-label={`Close ${app.label}`} className="h-14 px-4 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground">
                          Close
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}

      {/* The bottom bar, in the quick-nav's place and style. */}
      <footer className="relative shrink-0 border-t bg-linear-to-t from-slate-50 to-slate-50/95 dark:from-slate-950 dark:to-slate-950/95" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div role="toolbar" aria-label="Bottom bar" className="container mx-auto flex max-w-lg items-center gap-2 px-3 py-3">
          <button
            type="button"
            onClick={home}
            aria-pressed={front === null && !list}
            className={cn("flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors hover:bg-muted/80", front === null && !list ? "text-primary" : "text-muted-foreground")}
          >
            <House aria-hidden className="h-5 w-5" />
            Home
          </button>
          <button
            type="button"
            onClick={() => setList((l) => !l)}
            aria-expanded={list}
            aria-label={`${open.length} open`}
            className={cn("flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors hover:bg-muted/80", list ? "text-primary" : "text-muted-foreground")}
          >
            <Layers aria-hidden className="h-5 w-5" />
            {open.length} open
          </button>
          {aiReady ? (
            <HoldToTalk
              onRecorded={(r) => {
                setRecording(r);
                show("voice");
              }}
            />
          ) : (
            <Link href="/auth" className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium text-muted-foreground hover:bg-muted/40">
              <span className="p-1.5 rounded-lg bg-sky-100 dark:bg-sky-900/50">
                <LogIn aria-hidden className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </span>
              Sign in for voice log
            </Link>
          )}
        </div>
      </footer>
    </Layer>
  );
}
