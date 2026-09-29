import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "@intake/ui/use-toast";
import {
  SHELL_APPS,
  resolveWindowApp,
  type ShellAppId,
  type ShellAppSize,
  type WindowAppId,
  type WindowState,
} from "@/lib/nav-routes";

/**
 * Ward Console window manager: which app windows are open, their stacking
 * order, focus, and whether Home shows. A port of `openApp`, `closeWin`,
 * `focusWin`, `tidy` and `tileCols` in prototypes/os-v2/ward-console-4.html.
 *
 * Wide screens tile automatically (no free drag or resize yet), so window
 * geometry is not stored: `layoutWindows` derives it from the open windows
 * and the size of the window area on every render.
 *
 * Lives in sessionStorage: a reload keeps the open windows, a new tab starts
 * on Home.
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
}

export type OpenResult = { win: Win; created: boolean } | null;

interface WindowStoreState {
  wins: Win[];
  focus: string | null;
  /** Home shows instead of the focused window (phone). */
  showHome: boolean;
  /** Width is 768px or more: windows tile side by side. Set by the layer. */
  wide: boolean;
  z: number;
  nextId: number;

  /** One window per app: a second open focuses (and updates) the first. */
  open: (app: ShellAppId, st?: WindowState) => OpenResult;
  close: (id: string) => void;
  focusWin: (id: string) => void;
  /** Show and focus a window from the switcher. */
  switchTo: (id: string) => void;
  minimise: (id: string) => void;
  toggleMax: (id: string) => void;
  /** Merge into a window's state (e.g. the Metrics tab). */
  setSt: (id: string, patch: WindowState) => void;
  /** "Arrange side by side": un-maximise every window so they tile. */
  tidy: () => void;
  /** Minimise every window; they keep their state. */
  showDesktop: () => void;
  setShowHome: (show: boolean) => void;
  setWide: (wide: boolean) => void;
  closeAll: () => void;
}

const DEFAULT_ST: Record<WindowAppId, WindowState> = {
  meds: {},
  metrics: { tab: "summary" },
  profile: {},
};

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
        if (!state.wins.some((w) => w.id === id)) return;
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
        set((state) => ({ wins: state.wins.map((w) => (w.max ? { ...w, max: false } : w)) })),

      showDesktop: () =>
        set((state) => ({ wins: state.wins.map((w) => ({ ...w, min: true })), focus: null, showHome: true })),

      setShowHome: (show) => set({ showHome: show }),

      setWide: (wide) => {
        if (get().wide !== wide) set({ wide });
      },

      closeAll: () => set({ wins: [], focus: null, showHome: true }),
    }),
    {
      name: "intake-tracker-windows",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ wins: s.wins, focus: s.focus, showHome: s.showHome, z: s.z, nextId: s.nextId }),
    },
  ),
);

// ---------------------------------------------------------------------------
// Wide-screen auto-tiling
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Area {
  w: number;
  h: number;
}

/** Default window sizes on wide screens, from the prototype. */
export const WINDOW_SIZES: Record<ShellAppSize, readonly [number, number]> = {
  S: [520, 440],
  M: [720, 520],
  L: [880, 600],
};

const GAP = 8;

/** Where a single window sits: top left, at its app's default size. */
export function defaultRect(app: WindowAppId, area: Area): Rect {
  const [sw, sh] = WINDOW_SIZES[SHELL_APPS[app].size];
  const x = Math.min(16, Math.max(GAP, area.w - 368));
  const y = Math.min(12, Math.max(GAP, area.h - 268));
  return {
    x,
    y,
    w: Math.max(Math.min(360, area.w - 16), Math.min(sw, area.w - GAP - x)),
    h: Math.min(sh, area.h - GAP - y),
  };
}

/**
 * Wide-screen geometry for every window that is not minimised: one window
 * at its default size, two or three side by side in columns (on 900px or
 * wider), otherwise a 2×2 or 3×2 grid. A maximised window fills the area.
 * The prototype's `tidy` and `tileCols`.
 */
export function layoutWindows(wins: readonly Win[], area: Area): Record<string, Rect> {
  const rects: Record<string, Rect> = {};
  for (const w of wins) if (!w.min && w.max) rects[w.id] = { x: 0, y: 0, w: area.w, h: area.h };
  const vis = wins.filter((w) => !w.min && !w.max);
  const n = vis.length;
  if (n === 0) return rects;
  if (n === 1) {
    const only = vis[0] as Win;
    rects[only.id] = defaultRect(only.app, area);
    return rects;
  }
  if (n <= 3 && area.w >= 900) {
    const cw = Math.floor((area.w - GAP * (n + 1)) / n);
    vis.forEach((w, i) => {
      rects[w.id] = { x: GAP + i * (cw + GAP), y: GAP, w: cw, h: area.h - 2 * GAP };
    });
    return rects;
  }
  const cells: ReadonlyArray<readonly [number, number, number, number]> =
    n <= 4
      ? [
          [0, 0, 0.5, 0.5],
          [0.5, 0, 0.5, 0.5],
          [0, 0.5, 0.5, 0.5],
          [0.5, 0.5, 0.5, 0.5],
        ]
      : [0, 1, 2, 3, 4, 5].map((i) => [(i % 3) / 3, Math.floor(i / 3) / 2, 1 / 3, 0.5] as const);
  vis.forEach((w, i) => {
    const [cx, cy, cw, ch] = cells[i] as readonly [number, number, number, number];
    rects[w.id] = {
      x: Math.round(GAP + cx * (area.w - GAP)),
      y: Math.round(GAP + cy * (area.h - GAP)),
      w: Math.round(cw * (area.w - GAP) - GAP),
      h: Math.round(ch * (area.h - GAP) - GAP),
    };
  });
  return rects;
}
