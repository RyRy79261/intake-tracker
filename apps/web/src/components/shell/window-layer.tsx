"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { WINDOW_APPS } from "@/components/shell/app-registry";
import { WindowFrame } from "@/components/shell/window-frame";
import { closeWindow, goHome } from "@/hooks/use-window-history";
import { layoutWindows, useWindowStore, type Area } from "@/stores/window-store";
import { cn } from "@/lib/utils";

const WIDE_QUERY = "(min-width: 768px)";

function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True at 768px and wider, where windows tile instead of stacking. */
export function useIsWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

/** Is a modal (dialog, sheet, alert) open? Esc belongs to it then. */
function modalOpen(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

/**
 * The area between the sys-bar and the bottom bar where windows live. Phone:
 * the focused window fills it and Home is hidden. Wide: windows tile over
 * Home (see `layoutWindows`); Esc closes the focused one.
 *
 * `hidden` keeps every window mounted but off screen (e.g. on /settings).
 */
export function WindowLayer({ hidden = false }: { hidden?: boolean }) {
  const wins = useWindowStore((s) => s.wins);
  const focus = useWindowStore((s) => s.focus);
  const showHome = useWindowStore((s) => s.showHome);
  const focusWin = useWindowStore((s) => s.focusWin);
  const minimise = useWindowStore((s) => s.minimise);
  const toggleMax = useWindowStore((s) => s.toggleMax);
  const setWide = useWindowStore((s) => s.setWide);
  const wide = useIsWide();
  const phone = !wide;

  const layerRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<Area>({ w: 928, h: 756 });

  useEffect(() => setWide(wide), [wide, setWide]);

  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setArea((a) => (a.w === w && a.h === h ? a : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Esc closes the focused window on wide screens, unless a dialog has it.
  useEffect(() => {
    if (!wide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || modalOpen()) return;
      const id = useWindowStore.getState().focus;
      if (!id) return;
      const el = layerRef.current?.querySelector(`[data-wid="${id}"]`);
      if (!el || !(e.target instanceof Node)) return;
      // Keyboard focus inside the window, or nowhere in particular (the
      // window was clicked on a non-focusable spot).
      if (e.target !== document.body && !el.contains(e.target)) return;
      e.preventDefault();
      closeWindow(id);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [wide]);

  // When the window holding keyboard focus closes or is minimised, focus
  // would drop to <body>. Hand it to the window now on top, or back to the
  // sys-bar button that opens the app (Home in the bottom bar otherwise).
  const prevWins = useRef(wins);
  useEffect(() => {
    const prev = prevWins.current;
    prevWins.current = wins;
    const gone = prev.filter((p) => !p.min && !wins.some((w) => w.id === p.id && !w.min));
    if (gone.length === 0) return;
    const raf = requestAnimationFrame(() => {
      const active = document.activeElement;
      const lost =
        !active ||
        active === document.body ||
        !active.isConnected ||
        (active instanceof HTMLElement && active.offsetParent === null && active.getClientRects().length === 0);
      if (!lost) return;
      const s = useWindowStore.getState();
      const next = s.wins.find((w) => w.id === s.focus && !w.min);
      const title = next && (wide || !s.showHome) ? document.getElementById(`wt-${next.id}`) : null;
      const target =
        title ??
        document.querySelector<HTMLElement>(`[data-testid="sys-bar"] [data-app="${gone[0]!.app}"]`) ??
        document.querySelector<HTMLElement>('nav[aria-label="Bottom bar"] button');
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [wins, wide]);

  const rects = wide ? layoutWindows(wins, area) : {};
  const phoneActive = phone && !showHome && wins.some((w) => w.id === focus && !w.min);
  const anyShown = phone ? phoneActive : wins.some((w) => !w.min);

  return (
    <div
      ref={layerRef}
      data-testid="window-layer"
      aria-hidden={hidden || undefined}
      className={cn(
        "fixed inset-x-0 z-40 top-[calc(44px+env(safe-area-inset-top,0px))] bottom-[calc(56px+env(safe-area-inset-bottom,0px))]",
        phone ? "bg-background" : "pointer-events-none",
        // Measured even while empty, so the first tiled window lands right.
        (hidden || !anyShown) && "invisible",
      )}
    >
      {wins.map((win, i) => {
        const { Body, Overlay, flushTop } = WINDOW_APPS[win.app];
        const focused = win.id === focus;
        const visible = !hidden && !win.min && (wide || (focused && !showHome));
        return (
          <WindowFrame
            key={win.id}
            win={win}
            index={i + 1}
            total={wins.length}
            phone={phone}
            visible={visible}
            focused={focused}
            rect={rects[win.id]}
            onClose={() => closeWindow(win.id)}
            onHome={() => goHome()}
            onMinimise={() => minimise(win.id)}
            onToggleMax={() => toggleMax(win.id)}
            onFocus={() => focusWin(win.id)}
            overlay={Overlay ? <Overlay win={win} /> : undefined}
            flushTop={flushTop}
          >
            <Body win={win} />
          </WindowFrame>
        );
      })}
    </div>
  );
}
