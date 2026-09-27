"use client";

// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// Variant B, "Window stack": the dashboard as a scroll of OS windows on the
// CRT desktop, one per card, each with a pixel title bar and a collapse
// button. The window you last touched has the magenta (focused) title bar.
// A Today status window with block bars is pinned on top; the desktop shows
// in the gaps; the bottom bar jumps between windows.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuthGate } from "@/components/auth-guard";
import {
  BlockBar,
  BottomBar,
  LINKS,
  OsDesktop,
  PhoneSheet,
  PixelIcon,
  PROGRAMS,
  ProgramBody,
  Surface,
  WindowList,
  ago,
  dayLabel,
  fmt,
  useMinute,
  useToday,
  type PixelName,
  type ProgramId,
} from "@/app/_prototype-os/os-kit";

/** A label, a figure and ten small blocks: Today folded to one strip. */
function MiniMeter({ label, value, limit, unit, target }: { label: string; value: number; limit: number; unit: string; target: boolean }) {
  const ratio = limit > 0 ? value / limit : 0;
  const filled = Math.round(Math.min(Math.max(ratio, 0), 1) * 10);
  const over = !target && ratio > 1;
  const fill = over ? "bg-(--os-danger)" : target ? "bg-(--os-accent)" : ratio >= 0.85 ? "bg-(--os-primary)" : "bg-(--os-fg)";
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-1">
        <span className="os-pixel text-[10px] uppercase text-(--os-muted)">{label}</span>
        <span className="os-mono truncate text-[11px] tabular-nums text-(--os-fg)">
          {fmt(value)} {unit}
        </span>
      </span>
      <span aria-hidden className="flex h-2 gap-px">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`flex-1 ${i < filled ? fill : "bg-(--os-fg)/10"}`} />
        ))}
      </span>
    </span>
  );
}

const STACK: ProgramId[] = ["water", "food", "bp", "weight", "bathroom", "week"];

function StackWindow({
  id,
  title,
  icon,
  focused,
  collapsed,
  onFocus,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: PixelName;
  focused: boolean;
  collapsed: boolean;
  onFocus: () => void;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`os-win-${id}`}
      aria-roledescription="window"
      aria-label={title}
      onPointerDownCapture={onFocus}
      onFocusCapture={onFocus}
      className={`relative scroll-mt-3 border bg-(--os-panel) ${
        focused
          ? "border-(--os-primary) shadow-[0_0_32px_-10px_var(--os-primary),6px_6px_0_0_rgb(0_0_0/0.45)]"
          : "border-(--os-line) shadow-[5px_5px_0_0_rgb(0_0_0/0.4)]"
      }`}
    >
      <div
        className={`flex h-10 select-none items-center gap-2 border-b pl-2.5 pr-1 ${
          focused
            ? "border-(--os-primary) bg-(--os-primary) text-(--os-primary-fg)"
            : "border-(--os-line) bg-(--os-chrome) text-[color-mix(in_oklch,var(--os-muted)_60%,var(--os-fg))]"
        }`}
      >
        <PixelIcon name={icon} className="size-4 shrink-0" />
        <h2 className="os-pixel min-w-0 flex-1 truncate text-xs uppercase tracking-[0.2em]">{title}</h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${title}`}
          className="grid size-9 place-items-center hover:bg-(--os-bg)/30"
        >
          {collapsed ? (
            <span aria-hidden className="block size-3 border border-t-2 border-current" />
          ) : (
            <span aria-hidden className="mt-2 block h-0.5 w-3 bg-current" />
          )}
        </button>
      </div>
      {!collapsed && children}
    </section>
  );
}

export function VariantB() {
  const today = useToday();
  const now = useMinute();
  const showVoice = useAuthGate();
  const scroller = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<string>("today");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ week: true });
  const [sheet, setSheet] = useState<"windows" | null>(null);
  const ids: ProgramId[] = showVoice ? [...STACK, "voice"] : STACK;
  const openIds = ids.filter((id) => !collapsed[id]);

  // Today stays pinned: once its window scrolls away, a one-line strip of
  // small bars rides over the top of the stack (an overlay, so nothing
  // under your finger moves). Tap it to go back up.
  const todayRef = useRef<HTMLDivElement>(null);
  const [todayAway, setTodayAway] = useState(false);
  useEffect(() => {
    const el = todayRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setTodayAway(!e?.isIntersecting), {
      root: scroller.current,
      threshold: 0,
      rootMargin: "-40px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const jumpTo = (id: string) => {
    setSheet(null);
    setCollapsed((c) => ({ ...c, [id]: false }));
    setFocused(id);
    requestAnimationFrame(() =>
      document.getElementById(`os-win-${id}`)?.scrollIntoView({ block: "start" }),
    );
  };

  return (
    <OsDesktop label="Intake window stack">
      <Surface paused={sheet !== null} />
      <div
        ref={scroller}
        inert={sheet !== null || undefined}
        className="absolute inset-x-0 top-0 bottom-(--os-bar-h) overflow-y-auto overscroll-contain"
      >
        <div className="relative mx-auto flex max-w-lg flex-col gap-4 px-3 pb-8 pt-3">
          {/* The desktop's header: the name, lit, and the day. */}
          <div className="flex select-none items-baseline justify-between px-1 pt-1">
            <span className="os-pixel os-glow text-lg uppercase tracking-[0.2em]">Intake</span>
            <span className="os-mono text-[10px] uppercase tracking-[0.3em] text-(--os-muted)">
              {now ? dayLabel(now) : ""}
            </span>
          </div>

          <div ref={todayRef}>
          <StackWindow
            id="today"
            title="Today"
            icon="calendar"
            focused={focused === "today"}
            collapsed={!!collapsed.today}
            onFocus={() => setFocused("today")}
            onToggle={() => toggle("today")}
          >
            <div className="space-y-2.5 p-3">
              {today.meters.map((m) => (
                <BlockBar key={m.key} meter={m} compact />
              ))}
              <p className="os-mono flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-(--os-muted)">
                <span>
                  BP{" "}
                  <span className="text-(--os-fg)">
                    {today.bp ? `${today.bp.systolic}/${today.bp.diastolic}` : "none"}
                  </span>{" "}
                  {today.bp ? ago(today.bp.timestamp, now) : ""}
                </span>
                <span>
                  Weight <span className="text-(--os-fg)">{today.weight ? `${fmt(today.weight.weight)} kg` : "none"}</span>
                </span>
              </p>
            </div>
          </StackWindow>
          </div>

          {ids.map((id) => (
            <StackWindow
              key={id}
              id={id}
              title={PROGRAMS[id].label}
              icon={PROGRAMS[id].icon}
              focused={focused === id}
              collapsed={!!collapsed[id]}
              onFocus={() => setFocused(id)}
              onToggle={() => toggle(id)}
            >
              <div data-os-body className="p-3">
                <ProgramBody id={id} />
              </div>
            </StackWindow>
          ))}

          {/* The rest of the app: shortcuts on the desktop itself. */}
          <nav aria-label="More" className="grid select-none grid-cols-3 gap-2 pt-2">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group flex flex-col items-center gap-1.5 p-1 text-(--os-accent) outline-none hover:text-(--os-primary) focus-visible:outline-2 focus-visible:outline-(--os-primary)"
              >
                <PixelIcon name={l.icon} className="size-10" />
                <span className="os-pixel bg-(--os-chrome)/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-(--os-fg) group-hover:bg-(--os-primary) group-hover:text-(--os-bg)">
                  {l.label}
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {todayAway && sheet === null && (
        <button
          type="button"
          onClick={() => scroller.current?.scrollTo({ top: 0 })}
          aria-label="Today, back to the top"
          className="os-window-in absolute inset-x-0 top-0 z-20 border-b border-(--os-primary) bg-(--os-panel) shadow-[0_6px_0_0_rgb(0_0_0/0.35)]"
        >
          <span className="mx-auto grid max-w-lg grid-cols-2 gap-x-4 gap-y-1.5 px-4 py-2 text-left">
            {today.meters.map((m) => (
              <MiniMeter key={m.key} label={m.label} value={m.value} limit={m.limit} unit={m.unit} target={!!m.target} />
            ))}
          </span>
        </button>
      )}

      {sheet === "windows" && (
        <PhoneSheet title="Windows" onClose={() => setSheet(null)}>
          <WindowList ids={ids} current={null} onPick={jumpTo} onClose={(id) => setCollapsed((c) => ({ ...c, [id]: true }))} />
        </PhoneSheet>
      )}

      <BottomBar
        openCount={openIds.length}
        windowsOpen={sheet === "windows"}
        todayOpen={focused === "today" && !collapsed.today}
        onHome={() => {
          setSheet(null);
          scroller.current?.scrollTo({ top: 0 });
        }}
        onWindows={() => setSheet((s) => (s ? null : "windows"))}
        onToday={() => jumpTo("today")}
      />
    </OsDesktop>
  );
}
