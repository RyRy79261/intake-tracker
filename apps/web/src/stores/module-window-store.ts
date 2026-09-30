import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { MODULE_IDS, MODULE_MIN, arrangeModules, isModuleId, type ModuleId } from "@/lib/desk-modules";
import {
  KEY_STEP,
  fitRect,
  moveRect,
  resizeRect,
  snapRect,
  snapZone,
  type Area,
  type Edge,
  type Rect,
  type SnapSide,
} from "@/lib/window-geometry";
import { useWindowStore } from "@/stores/window-store";

/**
 * Desktop mode's intake modules (Today, Liquids, Food, Blood Pressure,
 * Weight, Urination, Defecation) as free windows on the desk.
 *
 * They behave like the app windows of `window-store.ts` (drag, resize, snap,
 * maximise, the same stacking order and the same measured area), with three
 * differences: a module is never closed, only minimised to its icon on the
 * desk band; they are not part of browser history or the six-window limit;
 * and where they sit is remembered on this device (localStorage), not per
 * tab and not synced.
 */

export interface ModuleWin extends Rect {
  id: ModuleId;
  /** Stacking order, shared with the app windows. */
  z: number;
  min: boolean;
  max: boolean;
  snap: SnapSide | null;
}

interface ModuleWindowState {
  wins: Record<ModuleId, ModuleWin>;
  /** The module with focus; only counts while no app window has it. */
  focus: ModuleId | null;
  /** The default arrangement has been applied once on this device. */
  arranged: boolean;

  /** Every module open in the default arrangement for this area ("Tidy"). */
  arrange: (area: Area) => void;
  focusWin: (id: ModuleId) => void;
  minimise: (id: ModuleId) => void;
  /** Bring a minimised module back where it was, in front. */
  restore: (id: ModuleId) => void;
  toggleMax: (id: ModuleId) => void;
  beginDrag: (id: ModuleId, px: number) => Rect;
  moveWin: (id: ModuleId, x: number, y: number, px?: number, py?: number) => void;
  endDrag: (id: ModuleId) => void;
  beginResize: (id: ModuleId) => Rect | null;
  resizeWin: (id: ModuleId, from: Rect, edge: Edge, dx: number, dy: number) => void;
  nudge: (id: ModuleId, dirX: number, dirY: number, resize: boolean) => void;
  /** Keep the shared stacking counter above every module (after a reload). */
  syncZ: () => void;
}

export const MODULE_WINDOWS_KEY = "intake-tracker-desk-modules";
export const MODULE_WINDOWS_VERSION = 1;

const area = (): Area => useWindowStore.getState().area;

const minFor = (a: Area) => ({ w: Math.min(MODULE_MIN.w, a.w), h: Math.min(MODULE_MIN.h, a.h) });

/**
 * Where a module window is drawn: the whole area when maximised, a half when
 * snapped, otherwise its own rect kept inside the area.
 */
export function moduleRect(win: ModuleWin, a: Area): Rect {
  if (win.max) return { x: 0, y: 0, w: a.w, h: a.h };
  if (win.snap) return snapRect(win.snap, a);
  return fitRect(win, a, minFor(a));
}

/** The next stacking position, above every app and module window. */
function nextZ(): number {
  const z = useWindowStore.getState().z + 1;
  useWindowStore.setState({ z });
  return z;
}

function initialWins(): Record<ModuleId, ModuleWin> {
  const rects = arrangeModules(area());
  const wins = {} as Record<ModuleId, ModuleWin>;
  MODULE_IDS.forEach((id, i) => {
    wins[id] = { id, ...rects[id], z: i + 1, min: false, max: false, snap: null };
  });
  return wins;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A stored window, if it is whole; stale or damaged entries are dropped. */
function validWin(id: ModuleId, raw: unknown): ModuleWin | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Partial<ModuleWin>;
  if (![w.x, w.y, w.w, w.h, w.z].every(finite)) return null;
  return {
    id,
    x: w.x as number,
    y: w.y as number,
    w: Math.max(MODULE_MIN.w, w.w as number),
    h: Math.max(MODULE_MIN.h, w.h as number),
    z: w.z as number,
    min: w.min === true,
    max: w.max === true,
    snap: w.snap === "l" || w.snap === "r" ? w.snap : null,
  };
}

export const useModuleWindowStore = create<ModuleWindowState>()(
  persist(
    (set, get) => {
      const patch = (id: ModuleId, p: Partial<ModuleWin>) =>
        set((s) => ({ wins: { ...s.wins, [id]: { ...s.wins[id], ...p } } }));
      /** In front, with focus taken from the app windows. */
      const raise = (id: ModuleId, p: Partial<ModuleWin> = {}) => {
        const z = nextZ();
        useWindowStore.setState({ focus: null });
        set((s) => ({ wins: { ...s.wins, [id]: { ...s.wins[id], ...p, z } }, focus: id }));
      };

      return {
        wins: initialWins(),
        focus: null,
        arranged: false,

        arrange: (a) => {
          const rects = arrangeModules(a);
          set((s) => {
            const wins = {} as Record<ModuleId, ModuleWin>;
            for (const id of MODULE_IDS) wins[id] = { ...s.wins[id], ...rects[id], min: false, max: false, snap: null };
            return { wins, arranged: true };
          });
        },

        focusWin: (id) => {
          const s = get();
          const top = useWindowStore.getState();
          if (s.focus === id && top.focus === null && s.wins[id].z === top.z) return;
          raise(id);
        },

        minimise: (id) => {
          patch(id, { min: true });
          if (get().focus === id) set({ focus: null });
        },

        restore: (id) => raise(id, { min: false }),

        toggleMax: (id) => raise(id, { max: !get().wins[id].max }),

        beginDrag: (id, px) => {
          const a = area();
          const win = get().wins[id];
          const shown = moduleRect(win, a);
          let rect = shown;
          if (win.max || win.snap) {
            // Back to its own size, with the pointer at the same place along
            // the title bar.
            const own = fitRect(win, a, minFor(a));
            const along = shown.w > 0 ? (px - shown.x) / shown.w : 0.5;
            rect = moveRect(own, px - along * own.w, shown.y, a);
          }
          patch(id, { ...rect, max: false, snap: null });
          useWindowStore.setState({ snapHint: null });
          return rect;
        },

        moveWin: (id, x, y, px, py) => {
          const a = area();
          const win = get().wins[id];
          const rect = moveRect(moduleRect({ ...win, max: false, snap: null }, a), x, y, a);
          patch(id, { ...rect, max: false, snap: null });
          const snapHint = px === undefined || py === undefined ? null : snapZone(px, py, a);
          if (useWindowStore.getState().snapHint !== snapHint) useWindowStore.setState({ snapHint });
        },

        endDrag: (id) => {
          const hint = useWindowStore.getState().snapHint;
          if (!hint) return;
          patch(id, hint === "max" ? { max: true } : { snap: hint, max: false });
          useWindowStore.setState({ snapHint: null });
        },

        beginResize: (id) => {
          const win = get().wins[id];
          if (win.max) return null;
          const rect = moduleRect(win, area());
          patch(id, { ...rect, snap: null });
          return rect;
        },

        resizeWin: (id, from, edge, dx, dy) => {
          const a = area();
          patch(id, { ...resizeRect(from, edge, dx, dy, a, minFor(a)), max: false, snap: null });
        },

        nudge: (id, dirX, dirY, resize) => {
          const a = area();
          const win = get().wins[id];
          if (win.max) return;
          const from = moduleRect(win, a);
          const dx = dirX * KEY_STEP;
          const dy = dirY * KEY_STEP;
          const rect = resize
            ? resizeRect(from, "se", dx, dy, a, minFor(a))
            : moveRect(from, from.x + dx, from.y + dy, a);
          patch(id, { ...rect, snap: null });
        },

        syncZ: () => {
          const top = Math.max(...MODULE_IDS.map((id) => get().wins[id].z));
          if (useWindowStore.getState().z < top) useWindowStore.setState({ z: top });
        },
      };
    },
    {
      name: MODULE_WINDOWS_KEY,
      version: MODULE_WINDOWS_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ wins: s.wins, arranged: s.arranged }),
      // A layout from another version is dropped: the default arrangement
      // is applied again.
      migrate: () => ({}),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as { wins?: Record<string, unknown>; arranged?: unknown };
        const wins = { ...current.wins };
        let whole = saved.arranged === true;
        for (const id of MODULE_IDS) {
          const win = validWin(id, saved.wins?.[id]);
          if (win) wins[id] = win;
          else whole = false;
        }
        // Anything missing means the arrangement has to be made again.
        return { ...current, wins: whole ? wins : current.wins, arranged: whole };
      },
    },
  ),
);

/** The module with focus, or null when an app window has it. */
export function focusedModule(moduleFocus: ModuleId | null, appFocus: string | null): ModuleId | null {
  return appFocus === null ? moduleFocus : null;
}

export { isModuleId };
