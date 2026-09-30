"use client";

import { memo, useEffect, useRef, useState } from "react";
import { WINDOW_APPS } from "@/components/shell/app-registry";
import { WindowFrame, type FreeWindowHandlers } from "@/components/shell/window-frame";
import { closeWindow, goHome } from "@/hooks/use-window-history";
import { layoutWindows, useWindowStore, winRect, type Rect, type Win } from "@/stores/window-store";
import { snapRect } from "@/lib/window-geometry";
import { focusWindowTitle, useIsDesktop, useIsWide } from "@/hooks/use-shell-mode";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/error-boundary";

export { useIsWide, useIsDesktop } from "@/hooks/use-shell-mode";

/** Is a modal (dialog, sheet, alert) open? Esc belongs to it then. */
function modalOpen(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

/**
 * A window's content. Moving or resizing a window changes its geometry on
 * every pointer move; the content only depends on the window's id and
 * state, so it is not rendered again for that.
 */
const WindowContent = memo(
  function WindowContent({ win }: { win: Win }) {
    const { Body } = WINDOW_APPS[win.app];
    return <Body win={win} />;
  },
  (a, b) => a.win.id === b.win.id && a.win.app === b.win.app && a.win.st === b.win.st,
);

const WindowOverlay = memo(
  function WindowOverlay({ win }: { win: Win }) {
    const { Overlay } = WINDOW_APPS[win.app];
    return Overlay ? <Overlay win={win} /> : null;
  },
  (a, b) => a.win.id === b.win.id && a.win.app === b.win.app && a.win.st === b.win.st,
);

/**
 * The area under the sys-bar where windows live. Phone: the focused window
 * fills it and Home is hidden. Tiled (from 768px): windows sit side by side
 * over Home (see `layoutWindows`). Desktop (from 1024px with a mouse):
 * windows are free and overlap. Esc closes the focused one; Ctrl+` (or
 * Alt+`) cycles through them, with Shift to go backwards.
 *
 * `hidden` keeps every window mounted but off screen (e.g. on /settings).
 */
export function WindowLayer({ hidden = false }: { hidden?: boolean }) {
  const wins = useWindowStore((s) => s.wins);
  const focus = useWindowStore((s) => s.focus);
  const showHome = useWindowStore((s) => s.showHome);
  const area = useWindowStore((s) => s.area);
  const snapHint = useWindowStore((s) => s.snapHint);
  const topZ = useWindowStore((s) => s.z);
  const focusWin = useWindowStore((s) => s.focusWin);
  const minimise = useWindowStore((s) => s.minimise);
  const toggleMax = useWindowStore((s) => s.toggleMax);
  const setWide = useWindowStore((s) => s.setWide);
  const setDesktop = useWindowStore((s) => s.setDesktop);
  const setArea = useWindowStore((s) => s.setArea);
  const wide = useIsWide();
  const desktop = useIsDesktop() && wide;
  const phone = !wide;

  const layerRef = useRef<HTMLDivElement>(null);
  /** A window is being dragged or resized. */
  const [gesture, setGesture] = useState(false);

  useEffect(() => setWide(wide), [wide, setWide]);
  useEffect(() => setDesktop(desktop), [desktop, setDesktop]);

  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setArea({ w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setArea]);

  // While a window is dragged or resized nothing else reacts to the pointer:
  // no text gets selected and window contents don't see hovers.
  useEffect(() => {
    if (!gesture) return;
    const root = document.documentElement;
    root.dataset.windowGesture = "true";
    return () => {
      delete root.dataset.windowGesture;
    };
  }, [gesture]);

  useEffect(() => {
    if (!wide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || modalOpen()) return;
      // Ctrl+` / Alt+` (Shift for backwards): the next window.
      if (e.code === "Backquote" && (e.ctrlKey || e.altKey) && !e.metaKey) {
        const next = useWindowStore.getState().cycle(e.shiftKey ? -1 : 1);
        if (!next) return;
        e.preventDefault();
        focusWindowTitle(next);
        return;
      }
      // Esc closes the focused window, unless a dialog has it.
      if (e.key !== "Escape") return;
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

  const tiled = wide && !desktop ? layoutWindows(wins, area) : {};
  const rectOf = (win: Win): Rect | undefined => (desktop ? winRect(win, area) : tiled[win.id]);
  const phoneActive = phone && !showHome && wins.some((w) => w.id === focus && !w.min);
  const anyShown = phone ? phoneActive : wins.some((w) => !w.min);

  /** Pointer position in the layer's own coordinates. */
  const toLayer = (clientX: number, clientY: number): [number, number] => {
    const r = layerRef.current?.getBoundingClientRect();
    return [clientX - (r?.left ?? 0), clientY - (r?.top ?? 0)];
  };

  const freeHandlers = (id: string): FreeWindowHandlers => ({
    beginDrag: (clientX, clientY) => {
      setGesture(true);
      return useWindowStore.getState().beginDrag(id, toLayer(clientX, clientY)[0]);
    },
    drag: (x, y, clientX, clientY) => {
      const [px, py] = toLayer(clientX, clientY);
      useWindowStore.getState().moveWin(id, x, y, px, py);
    },
    beginResize: () => {
      setGesture(true);
      return useWindowStore.getState().beginResize(id);
    },
    resize: (from, edge, dx, dy) => useWindowStore.getState().resizeWin(id, from, edge, dx, dy),
    end: (kind) => {
      setGesture(false);
      if (kind === "move") useWindowStore.getState().endDrag(id);
    },
    nudge: (dirX, dirY, resize) => useWindowStore.getState().nudge(id, dirX, dirY, resize),
  });

  const hintRect: Rect | null =
    desktop && snapHint ? (snapHint === "max" ? { x: 0, y: 0, w: area.w, h: area.h } : snapRect(snapHint, area)) : null;

  return (
    <div
      ref={layerRef}
      data-testid="window-layer"
      data-mode={phone ? "phone" : desktop ? "desktop" : "tiled"}
      aria-hidden={hidden || undefined}
      className={cn(
        "fixed inset-x-0 z-40 top-[calc(44px+env(safe-area-inset-top,0px))] bottom-[calc(var(--bbh,56px)+env(safe-area-inset-bottom,0px))]",
        phone ? "bg-background" : "pointer-events-none",
        // Measured even while empty, so the first window lands right.
        (hidden || !anyShown) && "invisible",
      )}
    >
      {hintRect && (
        <div
          aria-hidden="true"
          data-testid="snap-hint"
          className="pointer-events-none absolute border-2 border-dashed border-foreground bg-foreground/10"
          style={{
            left: hintRect.x + 4,
            top: hintRect.y + 4,
            width: hintRect.w - 8,
            height: hintRect.h - 8,
            zIndex: topZ + 1,
          }}
        />
      )}
      {wins.map((win, i) => {
        const { Overlay, flushTop } = WINDOW_APPS[win.app];
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
            rect={rectOf(win)}
            free={desktop ? freeHandlers(win.id) : undefined}
            onClose={() => closeWindow(win.id)}
            onHome={() => goHome()}
            onMinimise={() => minimise(win.id)}
            onToggleMax={() => toggleMax(win.id)}
            onFocus={() => focusWin(win.id)}
            overlay={
              Overlay ? (
                <ErrorBoundary fallback={null}>
                  <WindowOverlay win={win} />
                </ErrorBoundary>
              ) : undefined
            }
            flushTop={flushTop}
          >
            {/* A window that crashes keeps its frame (so it can be closed)
                and leaves Home, the other windows and Settings running. It
                is restored from sessionStorage on every load, so an
                uncontained crash would also break /settings and Go Home. */}
            <ErrorBoundary>
              <WindowContent win={win} />
            </ErrorBoundary>
          </WindowFrame>
        );
      })}
    </div>
  );
}
