// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@intake/ui/use-toast", () => ({ toast: vi.fn() }));

import { DESK_MODULES, MODULE_IDS, MODULE_MIN, arrangeModules, fitStack, moduleColumns, type ModuleId } from "@/lib/desk-modules";
import type { Area, Rect } from "@/lib/window-geometry";
import {
  MODULE_WINDOWS_KEY,
  MODULE_WINDOWS_VERSION,
  moduleRect,
  useModuleWindowStore,
} from "@/stores/module-window-store";
import { MAX_WINDOWS, useWindowStore } from "@/stores/window-store";

/** 1440×900: under the 44px sys-bar and over the 72px desk band. */
const AREA: Area = { w: 1440, h: 784 };

const mods = () => useModuleWindowStore.getState();
const apps = () => useWindowStore.getState();
const rectOf = (id: ModuleId): Rect => {
  const { x, y, w, h } = mods().wins[id];
  return { x, y, w, h };
};

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function overlapping(rects: Record<ModuleId, Rect>): string[] {
  const out: string[] = [];
  MODULE_IDS.forEach((a, i) =>
    MODULE_IDS.slice(i + 1).forEach((b) => {
      if (overlap(rects[a], rects[b])) out.push(`${a}/${b}`);
    }),
  );
  return out;
}

function reset(area: Area = AREA) {
  localStorage.clear();
  sessionStorage.clear();
  useWindowStore.setState({
    wins: [],
    focus: null,
    showHome: true,
    wide: true,
    desktop: true,
    area,
    snapHint: null,
    z: 0,
    nextId: 1,
  });
  useModuleWindowStore.setState({ focus: null, arranged: false });
  mods().arrange(area);
  // As the window layer does on mount: the counter starts above the modules.
  mods().syncZ();
}

describe("the default arrangement of the modules", () => {
  it.each([
    ["1440×900", { w: 1440, h: 784 }, 4],
    ["1920×1080", { w: 1920, h: 964 }, 4],
    ["2560×1440", { w: 2560, h: 1324 }, 4],
    ["1280×720", { w: 1280, h: 604 }, 3],
    ["1024×768", { w: 1024, h: 652 }, 2],
  ] as const)("at %s: every module on the desk, none overlapping", (_name, area, columns) => {
    expect(moduleColumns(area)).toBe(columns);
    const rects = arrangeModules(area);
    expect(Object.keys(rects).sort()).toEqual([...MODULE_IDS].sort());
    expect(overlapping(rects)).toEqual([]);
    for (const id of MODULE_IDS) {
      const r = rects[id];
      expect(r.x).toBeGreaterThanOrEqual(8);
      expect(r.y).toBeGreaterThanOrEqual(8);
      expect(r.x + r.w).toBeLessThanOrEqual(area.w - 8);
      expect(r.y + r.h).toBeLessThanOrEqual(area.h - 8);
      expect(r.w).toBeGreaterThanOrEqual(MODULE_MIN.w);
      expect(r.h).toBeGreaterThanOrEqual(MODULE_MIN.h);
    }
    // Today is top left.
    expect(rects.today).toMatchObject({ x: 8, y: 8 });
  });

  it("at 1440×900 Today spans two columns and nothing is cut that matters", () => {
    const r = arrangeModules(AREA);
    expect(r.today).toEqual({ x: 8, y: 8, w: 708, h: DESK_MODULES.today.natural });
    // Under Today: Blood Pressure and Weight at their natural heights.
    expect(r.bp).toEqual({ x: 8, y: 392, w: 350, h: DESK_MODULES.bp.natural });
    expect(r.weight).toEqual({ x: 366, y: 392, w: 350, h: DESK_MODULES.weight.natural });
    expect(r.liquids.h).toBe(DESK_MODULES.liquids.natural);
    expect(r.bowel.y).toBe(r.liquids.y + r.liquids.h + 8);
    // The long Food form gives up height (it scrolls) so Urination fits under it.
    expect(r.food.h).toBeLessThan(DESK_MODULES.food.natural);
    expect(r.food.h).toBeGreaterThanOrEqual(DESK_MODULES.food.comfy);
    expect(r.wee.y).toBe(r.food.y + r.food.h + 8);
  });

  it("at 1920×1080 every module but Food has its natural height", () => {
    const r = arrangeModules({ w: 1920, h: 964 });
    for (const id of MODULE_IDS.filter((m) => m !== "food" && m !== "wee")) {
      expect(r[id].h).toBe(DESK_MODULES[id].natural);
    }
    expect(r.today.w).toBe(470 * 2 + 8);
  });

  it("fitStack: natural heights when they fit, then a fair squeeze", () => {
    const a = { id: "food" as const, natural: 700, comfy: 300 };
    const b = { id: "wee" as const, natural: 200, comfy: 170 };
    expect(fitStack([a, b], 1000)).toEqual([700, 200]);
    // 100 too tall: each gives in proportion to what it can spare (400 : 30).
    expect(fitStack([a, b], 800)).toEqual([606, 193]);
    // Below the comfortable heights: on towards the minimum.
    const tight = fitStack([a, b], 400);
    expect(tight[0]! + tight[1]!).toBeLessThanOrEqual(400);
    expect(Math.min(...tight)).toBeGreaterThanOrEqual(MODULE_MIN.h);
    // Not even the minimums fit.
    expect(fitStack([a, b], 200)).toEqual([MODULE_MIN.h, MODULE_MIN.h]);
  });
});

describe("module window store", () => {
  beforeEach(() => reset());

  it("first run: all seven modules open in the default arrangement", () => {
    expect(mods().arranged).toBe(true);
    const expected = arrangeModules(AREA);
    for (const id of MODULE_IDS) {
      expect(rectOf(id)).toEqual(expected[id]);
      expect(mods().wins[id]).toMatchObject({ min: false, max: false, snap: null });
    }
  });

  it("minimise sends a module to its icon; restore brings it back to the same rect, in front", () => {
    mods().focusWin("liquids");
    mods().moveWin("liquids", 500, 120);
    const before = rectOf("liquids");
    mods().minimise("liquids");
    expect(mods().wins.liquids.min).toBe(true);
    expect(mods().focus).toBeNull();
    // Its geometry is untouched while it is an icon.
    expect(rectOf("liquids")).toEqual(before);

    mods().restore("liquids");
    expect(mods().wins.liquids.min).toBe(false);
    expect(rectOf("liquids")).toEqual(before);
    expect(mods().focus).toBe("liquids");
    expect(mods().wins.liquids.z).toBe(apps().z);
    for (const id of MODULE_IDS.filter((m) => m !== "liquids")) {
      expect(mods().wins[id].z).toBeLessThan(mods().wins.liquids.z);
    }
  });

  it("a module is never lost: there is no close, and all seven are always in the store", () => {
    for (const id of MODULE_IDS) mods().minimise(id);
    expect(Object.keys(mods().wins).sort()).toEqual([...MODULE_IDS].sort());
    expect(MODULE_IDS.every((id) => mods().wins[id].min)).toBe(true);
    expect("close" in mods()).toBe(false);
  });

  it("shares the stacking order and the focus with the app windows", () => {
    mods().focusWin("food");
    const meds = apps().open("meds")!.win;
    expect(meds.z).toBeGreaterThan(mods().wins.food.z);
    expect(apps().focus).toBe(meds.id);

    // Clicking a module takes the focus from the app window and goes on top.
    mods().focusWin("food");
    expect(apps().focus).toBeNull();
    expect(mods().focus).toBe("food");
    expect(mods().wins.food.z).toBeGreaterThan(apps().wins[0]!.z);

    // Already in front: nothing to raise.
    const z = apps().z;
    mods().focusWin("food");
    expect(apps().z).toBe(z);
  });

  it("modules do not count toward the app window limit and are not app windows", () => {
    expect(apps().wins).toHaveLength(0);
    expect(MODULE_IDS.length).toBeGreaterThan(MAX_WINDOWS);
    expect(apps().open("meds")?.created).toBe(true);
  });

  it("drags inside the desk and resizes down to the minimum size", () => {
    const from = mods().beginDrag("liquids", 800);
    mods().moveWin("liquids", from.x + 100, from.y + 60, 900, 100);
    expect(rectOf("liquids")).toEqual({ ...from, x: from.x + 100, y: from.y + 60 });
    mods().moveWin("liquids", -900, -900, 300, 100);
    expect(rectOf("liquids")).toMatchObject({ x: 0, y: 0 });
    mods().moveWin("liquids", 9000, 9000, 300, 100);
    expect(rectOf("liquids")).toMatchObject({ x: AREA.w - from.w, y: AREA.h - from.h });

    mods().moveWin("liquids", 100, 100, 300, 200);
    const start = mods().beginResize("liquids")!;
    mods().resizeWin("liquids", start, "se", 120, 40);
    expect(rectOf("liquids")).toEqual({ x: 100, y: 100, w: from.w + 120, h: from.h + 40 });
    mods().resizeWin("liquids", start, "se", -5000, -5000);
    expect(rectOf("liquids")).toEqual({ x: 100, y: 100, w: MODULE_MIN.w, h: MODULE_MIN.h });
  });

  it("snaps to a half at the side edges and maximises at the top", () => {
    mods().beginDrag("bp", 100);
    mods().moveWin("bp", -40, 200, 2, 230);
    expect(apps().snapHint).toBe("l");
    mods().endDrag("bp");
    expect(apps().snapHint).toBeNull();
    expect(moduleRect(mods().wins.bp, AREA)).toEqual({ x: 0, y: 0, w: 720, h: 784 });

    // Dragging it away gives it its own size back.
    const own = mods().beginDrag("bp", 360);
    expect(mods().wins.bp.snap).toBeNull();
    expect(own).toMatchObject({ w: 350, h: DESK_MODULES.bp.natural });

    mods().moveWin("bp", 300, -30, 400, -4);
    mods().endDrag("bp");
    expect(mods().wins.bp.max).toBe(true);
    expect(moduleRect(mods().wins.bp, AREA)).toEqual({ x: 0, y: 0, w: 1440, h: 784 });
    mods().toggleMax("bp");
    expect(mods().wins.bp.max).toBe(false);
  });

  it("moves and resizes from the keyboard in 16px steps", () => {
    const before = rectOf("weight");
    mods().nudge("weight", 1, 0, false);
    mods().nudge("weight", 0, -1, false);
    expect(rectOf("weight")).toEqual({ ...before, x: before.x + 16, y: before.y - 16 });
    mods().nudge("weight", 1, 1, true);
    expect(rectOf("weight")).toMatchObject({ w: before.w + 16, h: before.h + 16 });
  });

  it("Tidy puts every module back in the default arrangement, open", () => {
    mods().moveWin("food", 20, 20);
    mods().toggleMax("today");
    mods().minimise("wee");
    mods().minimise("bowel");
    mods().arrange(AREA);
    const expected = arrangeModules(AREA);
    for (const id of MODULE_IDS) {
      expect(rectOf(id)).toEqual(expected[id]);
      expect(mods().wins[id]).toMatchObject({ min: false, max: false, snap: null });
    }
  });

  it("remembers geometry and minimised state on this device (localStorage, versioned)", async () => {
    mods().moveWin("liquids", 640, 80);
    mods().resizeWin("liquids", rectOf("liquids"), "se", 60, -40);
    mods().minimise("wee");
    const placed = rectOf("liquids");

    const saved = JSON.parse(localStorage.getItem(MODULE_WINDOWS_KEY) ?? "{}") as {
      version: number;
      state: { wins: Record<string, Record<string, unknown>>; arranged: boolean; focus?: unknown };
    };
    expect(saved.version).toBe(MODULE_WINDOWS_VERSION);
    expect(saved.state.arranged).toBe(true);
    expect(saved.state.wins.liquids).toMatchObject(placed);
    expect(saved.state.wins.wee).toMatchObject({ min: true });
    expect(saved.state.focus).toBeUndefined();
    // Device only: nothing of it in the tab's session.
    expect(sessionStorage.getItem(MODULE_WINDOWS_KEY)).toBeNull();

    // A reload: the store starts again from what was saved.
    useModuleWindowStore.setState({ arranged: false });
    mods().arrange(AREA);
    localStorage.setItem(MODULE_WINDOWS_KEY, JSON.stringify(saved));
    await useModuleWindowStore.persist.rehydrate();
    expect(rectOf("liquids")).toEqual(placed);
    expect(mods().wins.wee.min).toBe(true);
    expect(mods().arranged).toBe(true);
  });

  it("clamps a remembered window to a smaller viewport on load", async () => {
    mods().moveWin("food", 1000, 100);
    const saved = localStorage.getItem(MODULE_WINDOWS_KEY)!;
    const small: Area = { w: 1024, h: 652 };
    useWindowStore.setState({ area: small });
    localStorage.setItem(MODULE_WINDOWS_KEY, saved);
    await useModuleWindowStore.persist.rehydrate();
    for (const id of MODULE_IDS) {
      const r = moduleRect(mods().wins[id], small);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(small.w);
      expect(r.y + r.h).toBeLessThanOrEqual(small.h);
    }
    // The stored place is kept for when the viewport is big again.
    expect(mods().wins.food.x).toBe(1000);
  });

  it("drops a damaged or out-of-date layout and arranges again", async () => {
    localStorage.setItem(
      MODULE_WINDOWS_KEY,
      JSON.stringify({ version: MODULE_WINDOWS_VERSION, state: { arranged: true, wins: { liquids: { x: "oops" } } } }),
    );
    await useModuleWindowStore.persist.rehydrate();
    expect(mods().arranged).toBe(false);
    expect(Object.keys(mods().wins).sort()).toEqual([...MODULE_IDS].sort());
    expect(MODULE_IDS.every((id) => Number.isFinite(mods().wins[id].w))).toBe(true);

    localStorage.setItem(MODULE_WINDOWS_KEY, JSON.stringify({ version: 0, state: { arranged: true, wins: mods().wins } }));
    await useModuleWindowStore.persist.rehydrate();
    expect(mods().arranged).toBe(false);
  });

  it("after a reload in a new tab, app windows still open above the modules", () => {
    mods().focusWin("today");
    mods().focusWin("liquids");
    const top = mods().wins.liquids.z;
    // A new tab: the session's stacking counter starts again.
    useWindowStore.setState({ z: 0 });
    mods().syncZ();
    expect(apps().z).toBe(top);
    expect(apps().open("metrics")!.win.z).toBeGreaterThan(top);
  });
});
