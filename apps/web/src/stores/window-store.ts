import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "@intake/ui/use-toast";
import { resolveWindowApp, type ShellAppId, type WindowAppId, type WindowState } from "@/lib/nav-routes";
import {
  DEFAULT_AREA,
  KEY_STEP,
  cascadeRect,
  defaultRect,
  fitRect,
  minSize,
  moveRect,
  resizeRect,
  snapRect,
  snapZone,
  tileRects,
  type Area,
  type Edge,
  type Rect,
  type SnapSide,
  type SnapZone,
} from "@/lib/window-geometry";

export { WINDOW_MIN, WINDOW_SIZES, defaultRect } from "@/lib/window-geometry";
export type { Area, Edge, Rect, SnapSide, SnapZone } from "@/lib/window-geometry";

/**
 * Ward Console window manager: which app windows are open, their stacking
 * order, focus, and whether Home shows. A port of `openApp`, `closeWin`,
 * `focusWin`, `tidy` and `tileCols` in prototypes/os-v2/ward-console-4.html.
 *
 * Three layouts share the store. Phone (under 768px): one window fills the
 * screen. Tiled (from 768px, and touch tablets): `layoutWindows` derives
 * every rect from the open windows and the size of the window area. Desktop
 * (from 1024px with a mouse): windows are free, so each keeps its own
 * geometry here (drag, 8-way resize, snap to a half, maximise). The
 * geometry rules are plain functions in `lib/window-geometry.ts`.
 *
 * Lives in sessionStorage: a reload keeps the open windows and where they
 * sit, a new tab starts on Home.
 */

export const MAX_WINDOWS = 6;
export const MAX_WINDOWS_MESSAGE = "Six windows are open. Close one to open another.";

export interface Win {
  id: string;
  app: WindowAppId;
  /** Per-window state, e.g. `{ tab: "records" }`. */
  st: WindowState;
  /** Stacking order; the higher one is on top. */
  z: number;
  min: boolean;
  max: boolean;
  /**
   * Free geometry on the desktop, in the window area's coordinates. Kept
   * while the window is maximised or snapped, for the restore.
   */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Snapped to the left or right half of the desktop. */
  snap?: SnapSide | null;
}

export type OpenResult = { win: Win; created: boolean } | null;

interface WindowStoreState {
  wins: Win[];
  focus: string | null;
  /** Home shows instead of the focused window (phone). */
  showHome: boolean;
  /** Width is 768px or more: windows tile side by side. Set by the layer. */
  wide: boolean;
  /** 1024px or more with a mouse: free, resizable windows. Set by the layer. */
  desktop: boolean;
  /** Size of the window area, measured by the layer. */
  area: Area;
  /** Where the window being dragged would snap on release. */
  snapHint: SnapZone;
  z: number;
  nextId: number;

  /** One window per app: a second open focuses (and updates) the first. */
  open: (app: ShellAppId, st?: WindowState) => OpenResult;
  close: (id: string) => void;
  focusWin: (id: string) => void;
  /** Show and focus a window from the switcher or the task strip. */
  switchTo: (id: string) => void;
  minimise: (id: string) => void;
  toggleMax: (id: string) => void;
  /** Merge into a window's state (e.g. the Metrics tab). */
  setSt: (id: string, patch: WindowState) => void;
  /**
   * "Arrange side by side": un-maximise every window so they tile. On the
   * desktop it also writes the tiled rects into the windows.
   */
  tidy: () => void;
  /** Minimise every window; they keep their state. */
  showDesktop: () => void;
  setShowHome: (show: boolean) => void;
  setWide: (wide: boolean) => void;
  setDesktop: (desktop: boolean) => void;
  setArea: (area: Area) => void;
  closeAll: () => void;
  /**
   * Phone: close every window but `id` (null closes them all and shows
   * Home). A phone shows one window at a time, so the others are closed, not
   * kept behind it.
   */
  keepOnly: (id: string | null) => void;

  // Desktop: free windows.
  /**
   * A title-bar drag begins with the pointer at `px` across the area. A maximised or
   * snapped window goes back to its own size under the pointer. Returns the
   * rect the drag starts from.
   */
  beginDrag: (id: string, px: number) => Rect | null;
  /** Move to (x, y), kept on the desktop; (px, py) is the pointer, for snap. */
  moveWin: (id: string, x: number, y: number, px?: number, py?: number) => void;
  /** The drag ended: snap to a half or maximise if the pointer is at an edge. */
  endDrag: (id: string) => void;
  /** A resize begins; returns the rect it starts from. */
  beginResize: (id: string) => Rect | null;
  /** Pull `edge` by (dx, dy) from the rect the resize began with. */
  resizeWin: (id: string, from: Rect, edge: Edge, dx: number, dy: number) => void;
  /** Keyboard: move by one step, or resize from the bottom right corner. */
  nudge: (id: string, dirX: number, dirY: number, resize: boolean) => void;
  snapWin: (id: string, side: SnapSide | null) => void;
  /** Focus the next (1) or previous (-1) window; returns its id. */
  cycle: (dir: 1 | -1) => string | null;
}

const DEFAULT_ST: Record<WindowAppId, WindowState> = {
  meds: {},
  metrics: { tab: "summary" },
  profile: {},
  /** The guide on screen; null for the index. */
  help: { slug: null },
};

/**
 * Where a free window is drawn: the whole area when maximised, a half when
 * snapped, otherwise its own rect, shrunk and shifted to stay on screen
 * (e.g. after the browser window got smaller).
 */
export function winRect(win: Win, area: Area): Rect {
  if (win.max) return { x: 0, y: 0, w: area.w, h: area.h };
  if (win.snap) return snapRect(win.snap, area);
  return fitRect(win, area, minSize(win.app, area));
}

/** Older sessions stored windows without geometry: give them the default. */
function withGeometry(win: Win, area: Area, n: number): Win {
  const ok = [win.x, win.y, win.w, win.h].every((v) => typeof v === "number" && Number.isFinite(v));
  return ok ? win : { ...win, ...defaultRect(win.app, area, n) };
}

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** The visible window on top, or null. */
export function topWindow(wins: readonly Win[]): Win | null {
  let top: Win | null = null;
  for (const w of wins) if (!w.min && (!top || w.z > top.z)) top = w;
  return top;
}

export const useWindowStore = create<WindowStoreState>()(
  persist(
    (set, get) => ({
      wins: [],
      focus: null,
      showHome: true,
      wide: false,
      desktop: false,
      area: DEFAULT_AREA,
      snapHint: null,
      z: 0,
      nextId: 1,

      open: (appId, stPatch) => {
        const resolved = resolveWindowApp(appId, stPatch);
        if (!resolved) return null;
        const { app, st } = resolved;
        const state = get();
        const existing = state.wins.find((w) => w.app === app);
        if (existing) {
          const z = state.z + 1;
          const win: Win = { ...existing, st: { ...existing.st, ...st }, min: false, z };
          set({
            wins: state.wins.map((w) => (w.id === existing.id ? win : w)),
            focus: win.id,
            showHome: false,
            z,
          });
          return { win, created: false };
        }
        if (state.wins.length >= MAX_WINDOWS) {
          toast({ title: MAX_WINDOWS_MESSAGE });
          return null;
        }
        const z = state.z + 1;
        const win: Win = {
          id: `w${state.nextId}`,
          app,
          st: { ...DEFAULT_ST[app], ...st },
          z,
          min: false,
          max: false,
          // Cascade: a step down and right of the windows already there.
          ...cascadeRect(
            app,
            state.area,
            state.wins.filter((w) => !w.min && !w.max && !w.snap),
          ),
          snap: null,
        };
        set({ wins: [...state.wins, win], focus: win.id, showHome: false, z, nextId: state.nextId + 1 });
        return { win, created: true };
      },

      close: (id) => {
        const state = get();
        if (!state.wins.some((w) => w.id === id)) return;
        const wins = state.wins.filter((w) => w.id !== id);
        if (state.focus !== id) {
          set({ wins });
          return;
        }
        const top = topWindow(wins);
        // On a phone, closing the last visible window returns to Home.
        set({ wins, focus: top?.id ?? null, showHome: top ? state.showHome : !state.wide || state.showHome });
      },

      focusWin: (id) => {
        const state = get();
        const win = state.wins.find((w) => w.id === id);
        if (!win) return;
        // Already focused and on top: nothing to raise.
        if (state.focus === id && win.z === state.z) return;
        const z = state.z + 1;
        set({ wins: state.wins.map((w) => (w.id === id ? { ...w, z } : w)), focus: id, z });
      },

      switchTo: (id) => {
        const state = get();
        if (!state.wins.some((w) => w.id === id)) return;
        const z = state.z + 1;
        set({
          wins: state.wins.map((w) => (w.id === id ? { ...w, z, min: false } : w)),
          focus: id,
          showHome: false,
          z,
        });
      },

      minimise: (id) => {
        const state = get();
        const wins = state.wins.map((w) => (w.id === id ? { ...w, min: true } : w));
        const focus = state.focus === id ? (topWindow(wins)?.id ?? null) : state.focus;
        set({ wins, focus });
      },

      toggleMax: (id) => {
        const state = get();
        if (!state.wins.some((w) => w.id === id)) return;
        const z = state.z + 1;
        set({
          wins: state.wins.map((w) => (w.id === id ? { ...w, max: !w.max, z } : w)),
          focus: id,
          z,
        });
      },

      setSt: (id, patch) =>
        set((state) => ({
          wins: state.wins.map((w) => (w.id === id ? { ...w, st: { ...w.st, ...patch } } : w)),
        })),

      tidy: () =>
        set((state) => {
          if (!state.desktop) return { wins: state.wins.map((w) => (w.max ? { ...w, max: false } : w)) };
          const vis = state.wins.filter((w) => !w.min);
          const rects = tileRects(
            vis.map((w) => w.app),
            state.area,
          );
          return {
            wins: state.wins.map((w) => {
              const i = vis.indexOf(w);
              return i < 0 ? w : { ...w, ...(rects[i] as Rect), max: false, snap: null };
            }),
          };
        }),

      showDesktop: () =>
        set((state) => ({ wins: state.wins.map((w) => ({ ...w, min: true })), focus: null, showHome: true })),

      setShowHome: (show) => set({ showHome: show }),

      setWide: (wide) => {
        if (get().wide !== wide) set({ wide });
      },

      setDesktop: (desktop) => {
        if (get().desktop !== desktop) set({ desktop, snapHint: null });
      },

      setArea: (area) => {
        const cur = get().area;
        if (cur.w !== area.w || cur.h !== area.h) set({ area });
      },

      closeAll: () => set({ wins: [], focus: null, showHome: true }),

      keepOnly: (id) => {
        const state = get();
        const wins = state.wins.filter((w) => w.id === id);
        if (wins.length === state.wins.length) return;
        set(wins.length > 0 ? { wins, focus: id } : { wins, focus: null, showHome: true });
      },

      beginDrag: (id, px) => {
        const state = get();
        const win = state.wins.find((w) => w.id === id);
        if (!win) return null;
        const shown = winRect(win, state.area);
        let rect = shown;
        if (win.max || win.snap) {
          // Back to its own size, with the pointer at the same place along
          // the title bar.
          const own = fitRect(win, state.area, minSize(win.app, state.area));
          const along = shown.w > 0 ? (px - shown.x) / shown.w : 0.5;
          rect = moveRect(own, px - along * own.w, shown.y, state.area);
        }
        set({
          wins: state.wins.map((w) => (w.id === id ? { ...w, ...rect, max: false, snap: null } : w)),
          snapHint: null,
        });
        return rect;
      },

      moveWin: (id, x, y, px, py) => {
        const state = get();
        const win = state.wins.find((w) => w.id === id);
        if (!win) return;
        const from = winRect({ ...win, max: false, snap: null }, state.area);
        const rect = moveRect(from, x, y, state.area);
        const snapHint = px === undefined || py === undefined ? null : snapZone(px, py, state.area);
        if (sameRect(rect, win) && !win.max && !win.snap && snapHint === state.snapHint) return;
        set({
          wins: state.wins.map((w) => (w.id === id ? { ...w, ...rect, max: false, snap: null } : w)),
          snapHint,
        });
      },

      endDrag: (id) => {
        const state = get();
        const hint = state.snapHint;
        if (!hint) return;
        set({
          wins: state.wins.map((w) =>
            w.id !== id ? w : hint === "max" ? { ...w, max: true } : { ...w, snap: hint, max: false },
          ),
          snapHint: null,
        });
      },

      beginResize: (id) => {
        const state = get();
        const win = state.wins.find((w) => w.id === id);
        if (!win || win.max) return null;
        const rect = winRect(win, state.area);
        set({ wins: state.wins.map((w) => (w.id === id ? { ...w, ...rect, snap: null } : w)) });
        return rect;
      },

      resizeWin: (id, from, edge, dx, dy) => {
        const state = get();
        const win = state.wins.find((w) => w.id === id);
        if (!win) return;
        const rect = resizeRect(from, edge, dx, dy, state.area, minSize(win.app, state.area));
        if (sameRect(rect, win) && !win.max && !win.snap) return;
        set({ wins: state.wins.map((w) => (w.id === id ? { ...w, ...rect, max: false, snap: null } : w)) });
      },

      nudge: (id, dirX, dirY, resize) => {
        const state = get();
        const win = state.wins.find((w) => w.id === id);
        if (!win || win.max) return;
        const from = winRect(win, state.area);
        const dx = dirX * KEY_STEP;
        const dy = dirY * KEY_STEP;
        const rect = resize
          ? resizeRect(from, "se", dx, dy, state.area, minSize(win.app, state.area))
          : moveRect(from, from.x + dx, from.y + dy, state.area);
        set({ wins: state.wins.map((w) => (w.id === id ? { ...w, ...rect, snap: null } : w)) });
      },

      snapWin: (id, side) =>
        set((state) => ({
          wins: state.wins.map((w) => (w.id === id ? { ...w, snap: side, max: false } : w)),
        })),

      cycle: (dir) => {
        const state = get();
        const vis = state.wins.filter((w) => !w.min);
        const pool = vis.length > 0 ? vis : state.wins;
        if (pool.length === 0) return null;
        const at = pool.findIndex((w) => w.id === state.focus);
        // Nothing focused: forward starts at the first window, back at the last.
        const idx = at < 0 ? (dir === 1 ? 0 : pool.length - 1) : (at + dir + pool.length) % pool.length;
        const next = pool[idx] as Win;
        get().switchTo(next.id);
        return next.id;
      },
    }),
    {
      name: "intake-tracker-windows",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ wins: s.wins, focus: s.focus, showHome: s.showHome, z: s.z, nextId: s.nextId }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<WindowStoreState>;
        const wins = Array.isArray(saved.wins) ? saved.wins.map((w, i) => withGeometry(w, current.area, i)) : [];
        return { ...current, ...saved, wins };
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Wide-screen auto-tiling
// ---------------------------------------------------------------------------

/**
 * Tiled geometry for every window that is not minimised: one window at its
 * default size, two or three side by side in columns (on 900px or wider),
 * otherwise a 2×2 or 3×2 grid. A maximised window fills the area.
 */
export function layoutWindows(wins: readonly Win[], area: Area): Record<string, Rect> {
  const rects: Record<string, Rect> = {};
  for (const w of wins) if (!w.min && w.max) rects[w.id] = { x: 0, y: 0, w: area.w, h: area.h };
  const vis = wins.filter((w) => !w.min && !w.max);
  const tiles = tileRects(
    vis.map((w) => w.app),
    area,
  );
  vis.forEach((w, i) => {
    rects[w.id] = tiles[i] as Rect;
  });
  return rects;
}
