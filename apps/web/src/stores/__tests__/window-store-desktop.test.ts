// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@intake/ui/use-toast", () => ({ toast: vi.fn() }));

import { WINDOW_MIN, useWindowStore, winRect, type Rect, type Win } from "@/stores/window-store";
import {
  CASCADE_STEP,
  KEY_STEP,
  cascadeRect,
  defaultRect,
  fitRect,
  minSize,
  moveRect,
  resizeRect,
  snapRect,
  snapZone,
} from "@/lib/window-geometry";

/** A 1440×900 screen: the area under the 44px sys-bar. */
const AREA = { w: 1440, h: 856 };

const store = () => useWindowStore.getState();
const get = (id: string) => store().wins.find((w) => w.id === id) as Win;
const rectOf = (id: string): Rect => {
  const { x, y, w, h } = get(id);
  return { x, y, w, h };
};

function reset(area = AREA) {
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
}

describe("window geometry", () => {
  const min = { w: 360, h: 320 };

  it("moveRect keeps the whole window inside the area", () => {
    const r = { x: 100, y: 100, w: 600, h: 400 };
    expect(moveRect(r, -50, -20, AREA)).toMatchObject({ x: 0, y: 0 });
    expect(moveRect(r, 5000, 5000, AREA)).toMatchObject({ x: 1440 - 600, y: 856 - 400 });
    expect(moveRect(r, 200.4, 300.6, AREA)).toEqual({ x: 200, y: 301, w: 600, h: 400 });
  });

  it("resizeRect pulls each edge and leaves the opposite one put", () => {
    const from = { x: 100, y: 100, w: 600, h: 400 };
    expect(resizeRect(from, "e", 50, 99, AREA, min)).toEqual({ x: 100, y: 100, w: 650, h: 400 });
    expect(resizeRect(from, "s", 99, 50, AREA, min)).toEqual({ x: 100, y: 100, w: 600, h: 450 });
    expect(resizeRect(from, "w", -40, 0, AREA, min)).toEqual({ x: 60, y: 100, w: 640, h: 400 });
    expect(resizeRect(from, "n", 0, -30, AREA, min)).toEqual({ x: 100, y: 70, w: 600, h: 430 });
    expect(resizeRect(from, "se", 20, 10, AREA, min)).toEqual({ x: 100, y: 100, w: 620, h: 410 });
    expect(resizeRect(from, "nw", 20, 10, AREA, min)).toEqual({ x: 120, y: 110, w: 580, h: 390 });
    expect(resizeRect(from, "ne", 20, 10, AREA, min)).toEqual({ x: 100, y: 110, w: 620, h: 390 });
    expect(resizeRect(from, "sw", 20, 10, AREA, min)).toEqual({ x: 120, y: 100, w: 580, h: 410 });
  });

  it("resizeRect stops at the minimum size and at the edges of the area", () => {
    const from = { x: 100, y: 100, w: 600, h: 400 };
    // Shrinking: never under the minimum, and the far edge does not move.
    expect(resizeRect(from, "e", -900, 0, AREA, min)).toEqual({ x: 100, y: 100, w: 360, h: 400 });
    expect(resizeRect(from, "w", 900, 0, AREA, min)).toEqual({ x: 340, y: 100, w: 360, h: 400 });
    expect(resizeRect(from, "n", 0, 900, AREA, min)).toEqual({ x: 100, y: 180, w: 600, h: 320 });
    expect(resizeRect(from, "s", 0, -900, AREA, min)).toEqual({ x: 100, y: 100, w: 600, h: 320 });
    // Growing: never past the area.
    expect(resizeRect(from, "se", 5000, 5000, AREA, min)).toEqual({ x: 100, y: 100, w: 1340, h: 756 });
    expect(resizeRect(from, "nw", -5000, -5000, AREA, min)).toEqual({ x: 0, y: 0, w: 700, h: 500 });
  });

  it("fitRect shrinks and shifts a rect as little as needed to stay on screen", () => {
    const small = { w: 1024, h: 600 };
    expect(fitRect({ x: 900, y: 500, w: 600, h: 400 }, small, min)).toEqual({ x: 424, y: 200, w: 600, h: 400 });
    expect(fitRect({ x: 40, y: 40, w: 1400, h: 800 }, small, min)).toEqual({ x: 0, y: 0, w: 1024, h: 600 });
    // Already inside: unchanged.
    expect(fitRect({ x: 40, y: 40, w: 600, h: 400 }, small, min)).toEqual({ x: 40, y: 40, w: 600, h: 400 });
  });

  it("every app has a minimum size, capped by the area", () => {
    for (const app of ["meds", "metrics", "profile", "help"] as const) {
      const [w, h] = WINDOW_MIN[app];
      expect(w).toBeGreaterThanOrEqual(360);
      expect(minSize(app, AREA)).toEqual({ w, h });
    }
    expect(minSize("metrics", { w: 300, h: 200 })).toEqual({ w: 300, h: 200 });
  });

  it("cascades new windows down and right of the ones already there", () => {
    const first = cascadeRect("meds", AREA, []);
    expect(first).toEqual(defaultRect("meds", AREA, 0));
    const second = cascadeRect("metrics", AREA, [first]);
    expect(second.x).toBe(first.x + CASCADE_STEP);
    expect(second.y).toBe(first.y + CASCADE_STEP);
    // The first slot is free again once that window has moved away.
    expect(cascadeRect("profile", AREA, [second])).toMatchObject({ x: first.x, y: first.y });
  });

  it("snapZone: left and right edges snap to a half, the top maximises", () => {
    expect(snapZone(700, 300, AREA)).toBeNull();
    expect(snapZone(4, 300, AREA)).toBe("l");
    expect(snapZone(1436, 300, AREA)).toBe("r");
    expect(snapZone(700, 0, AREA)).toBe("max");
    expect(snapZone(700, -12, AREA)).toBe("max");
    expect(snapRect("l", AREA)).toEqual({ x: 0, y: 0, w: 720, h: 856 });
    expect(snapRect("r", AREA)).toEqual({ x: 720, y: 0, w: 720, h: 856 });
  });
});

describe("window store on the desktop", () => {
  beforeEach(() => reset());

  it("opens windows at their default size, cascading", () => {
    const a = store().open("meds")!.win;
    const b = store().open("metrics")!.win;
    const c = store().open("profile")!.win;
    expect(rectOf(a.id)).toEqual({ x: 16, y: 12, w: 720, h: 520 });
    expect(rectOf(b.id)).toEqual({ x: 44, y: 40, w: 880, h: 600 });
    expect(rectOf(c.id)).toEqual({ x: 72, y: 68, w: 720, h: 520 });
  });

  it("raises a window on focus and keeps the stacking order of the rest", () => {
    const a = store().open("meds")!.win;
    const b = store().open("metrics")!.win;
    const c = store().open("profile")!.win;
    expect(get(c.id).z).toBeGreaterThan(get(b.id).z);
    store().focusWin(a.id);
    expect(store().focus).toBe(a.id);
    expect(get(a.id).z).toBeGreaterThan(get(c.id).z);
    expect(get(c.id).z).toBeGreaterThan(get(b.id).z);
    // Focusing the window already on top changes nothing.
    const z = store().z;
    store().focusWin(a.id);
    expect(store().z).toBe(z);
  });

  it("drags a window and keeps it on the desktop", () => {
    const a = store().open("meds")!.win;
    const from = store().beginDrag(a.id, 100)!;
    expect(from).toEqual({ x: 16, y: 12, w: 720, h: 520 });
    store().moveWin(a.id, from.x + 300, from.y + 120, 400, 150);
    expect(rectOf(a.id)).toEqual({ x: 316, y: 132, w: 720, h: 520 });
    store().moveWin(a.id, -400, -400, 300, 150);
    expect(rectOf(a.id)).toMatchObject({ x: 0, y: 0 });
    store().moveWin(a.id, 9000, 9000, 1200, 800);
    expect(rectOf(a.id)).toMatchObject({ x: 1440 - 720, y: 856 - 520 });
    store().endDrag(a.id);
    expect(get(a.id).max).toBe(false);
    expect(get(a.id).snap ?? null).toBeNull();
  });

  it("resizes from an edge, down to the app's minimum size", () => {
    const a = store().open("meds")!.win;
    const from = store().beginResize(a.id)!;
    store().resizeWin(a.id, from, "se", 100, 60);
    expect(rectOf(a.id)).toEqual({ x: 16, y: 12, w: 820, h: 580 });
    store().resizeWin(a.id, from, "se", -2000, -2000);
    const [mw, mh] = WINDOW_MIN.meds;
    expect(rectOf(a.id)).toEqual({ x: 16, y: 12, w: mw, h: mh });
    store().resizeWin(a.id, from, "nw", -2000, -2000);
    expect(rectOf(a.id)).toEqual({ x: 0, y: 0, w: 736, h: 532 });
  });

  it("maximises and restores to the same place", () => {
    const a = store().open("meds")!.win;
    store().moveWin(a.id, 200, 100);
    store().toggleMax(a.id);
    expect(get(a.id).max).toBe(true);
    expect(winRect(get(a.id), AREA)).toEqual({ x: 0, y: 0, w: 1440, h: 856 });
    // Its own geometry is kept for the restore.
    expect(rectOf(a.id)).toEqual({ x: 200, y: 100, w: 720, h: 520 });
    store().toggleMax(a.id);
    expect(winRect(get(a.id), AREA)).toEqual({ x: 200, y: 100, w: 720, h: 520 });
  });

  it("minimises to the task strip and restores with its geometry", () => {
    const a = store().open("meds")!.win;
    const b = store().open("metrics")!.win;
    store().moveWin(b.id, 400, 200);
    store().minimise(b.id);
    expect(get(b.id).min).toBe(true);
    expect(store().focus).toBe(a.id);
    store().switchTo(b.id);
    expect(get(b.id).min).toBe(false);
    expect(store().focus).toBe(b.id);
    expect(rectOf(b.id)).toEqual({ x: 400, y: 200, w: 880, h: 600 });
    expect(get(b.id).z).toBeGreaterThan(get(a.id).z);
  });

  it("snaps to a half when dropped at the left or right edge, and maximises at the top", () => {
    const a = store().open("meds")!.win;
    store().beginDrag(a.id, 100);
    store().moveWin(a.id, -50, 200, 3, 220);
    expect(store().snapHint).toBe("l");
    store().endDrag(a.id);
    expect(store().snapHint).toBeNull();
    expect(get(a.id).snap).toBe("l");
    expect(winRect(get(a.id), AREA)).toEqual({ x: 0, y: 0, w: 720, h: 856 });

    const b = store().open("metrics")!.win;
    store().beginDrag(b.id, 300);
    store().moveWin(b.id, 900, 200, 1438, 220);
    store().endDrag(b.id);
    expect(winRect(get(b.id), AREA)).toEqual({ x: 720, y: 0, w: 720, h: 856 });

    const c = store().open("profile")!.win;
    store().beginDrag(c.id, 300);
    store().moveWin(c.id, 300, -40, 320, -6);
    expect(store().snapHint).toBe("max");
    store().endDrag(c.id);
    expect(get(c.id).max).toBe(true);
  });

  it("dragging a snapped or maximised window puts it back to its own size under the pointer", () => {
    const a = store().open("meds")!.win;
    store().snapWin(a.id, "r");
    // Grabbed a quarter of the way along the snapped title bar.
    const from = store().beginDrag(a.id, 720 + 180)!;
    expect(get(a.id).snap).toBeNull();
    expect(from).toMatchObject({ w: 720, h: 520, y: 0 });
    expect(from.x).toBe(900 - 180);

    store().toggleMax(a.id);
    const again = store().beginDrag(a.id, 720)!;
    expect(get(a.id).max).toBe(false);
    expect(again).toMatchObject({ x: 360, y: 0, w: 720, h: 520 });
  });

  it("resizing a snapped window starts from the half it fills", () => {
    const a = store().open("meds")!.win;
    store().snapWin(a.id, "l");
    const from = store().beginResize(a.id)!;
    expect(from).toEqual({ x: 0, y: 0, w: 720, h: 856 });
    store().resizeWin(a.id, from, "e", -100, 0);
    expect(get(a.id).snap).toBeNull();
    expect(rectOf(a.id)).toEqual({ x: 0, y: 0, w: 620, h: 856 });
    // A maximised window has nothing to resize.
    store().toggleMax(a.id);
    expect(store().beginResize(a.id)).toBeNull();
  });

  it("moves and resizes from the keyboard in 16px steps", () => {
    const a = store().open("meds")!.win;
    store().nudge(a.id, 1, 0, false);
    store().nudge(a.id, 0, 1, false);
    expect(rectOf(a.id)).toEqual({ x: 16 + KEY_STEP, y: 12 + KEY_STEP, w: 720, h: 520 });
    store().nudge(a.id, -1, 0, true);
    store().nudge(a.id, 0, 1, true);
    expect(rectOf(a.id)).toEqual({ x: 32, y: 28, w: 720 - KEY_STEP, h: 520 + KEY_STEP });
    // Clamped like a drag.
    for (let i = 0; i < 10; i++) store().nudge(a.id, -1, -1, false);
    expect(rectOf(a.id)).toMatchObject({ x: 0, y: 0 });
    // A maximised window stays put.
    store().toggleMax(a.id);
    store().nudge(a.id, 1, 1, false);
    expect(rectOf(a.id)).toMatchObject({ x: 0, y: 0 });
  });

  it("tidy tiles every visible window and clears maximise and snap", () => {
    const a = store().open("meds")!.win;
    const b = store().open("metrics")!.win;
    const c = store().open("profile")!.win;
    store().toggleMax(a.id);
    store().snapWin(b.id, "l");
    store().minimise(c.id);
    const before = rectOf(c.id);
    store().tidy();
    // Two visible windows: equal columns with 8px gutters.
    expect(rectOf(a.id)).toEqual({ x: 8, y: 8, w: 708, h: 840 });
    expect(rectOf(b.id)).toEqual({ x: 724, y: 8, w: 708, h: 840 });
    expect(get(a.id).max).toBe(false);
    expect(get(b.id).snap).toBeNull();
    // The minimised one is left alone.
    expect(rectOf(c.id)).toEqual(before);
    expect(get(c.id).min).toBe(true);
  });

  it("keeps windows on screen when the viewport shrinks, and gives the room back when it grows", () => {
    const a = store().open("metrics")!.win;
    store().moveWin(a.id, 540, 240);
    expect(rectOf(a.id)).toEqual({ x: 540, y: 240, w: 880, h: 600 });

    store().setArea({ w: 1024, h: 600 });
    const shown = winRect(get(a.id), store().area);
    expect(shown).toEqual({ x: 144, y: 0, w: 880, h: 600 });
    expect(shown.x + shown.w).toBeLessThanOrEqual(1024);
    expect(shown.y + shown.h).toBeLessThanOrEqual(600);

    // Smaller than the window: it shrinks to the area.
    store().setArea({ w: 700, h: 400 });
    expect(winRect(get(a.id), store().area)).toEqual({ x: 0, y: 0, w: 700, h: 400 });

    // The stored geometry was never overwritten.
    store().setArea(AREA);
    expect(winRect(get(a.id), store().area)).toEqual({ x: 540, y: 240, w: 880, h: 600 });
  });

  it("cycles through the open windows in both directions", () => {
    const a = store().open("meds")!.win;
    const b = store().open("metrics")!.win;
    const c = store().open("profile")!.win;
    expect(store().focus).toBe(c.id);
    expect(store().cycle(1)).toBe(a.id);
    expect(store().focus).toBe(a.id);
    expect(store().cycle(1)).toBe(b.id);
    expect(store().cycle(-1)).toBe(a.id);
    expect(store().cycle(-1)).toBe(c.id);
    // Minimised windows are skipped while others are on screen.
    store().minimise(a.id);
    expect(store().cycle(1)).toBe(b.id);
    expect(store().cycle(1)).toBe(c.id);
    // Nothing on screen: the first minimised one is restored.
    store().showDesktop();
    expect(store().cycle(1)).toBe(a.id);
    expect(get(a.id).min).toBe(false);
    reset();
    expect(store().cycle(1)).toBeNull();
  });

  it("persists geometry for the session and restores it on rehydrate", async () => {
    const a = store().open("meds")!.win;
    store().moveWin(a.id, 300, 140);
    store().resizeWin(a.id, { x: 300, y: 140, w: 720, h: 520 }, "se", -120, 40);
    store().snapWin(a.id, "l");

    const saved = JSON.parse(sessionStorage.getItem("intake-tracker-windows") ?? "{}") as {
      state: { wins: Win[]; area?: unknown; snapHint?: unknown };
    };
    expect(saved.state.wins[0]).toMatchObject({ x: 300, y: 140, w: 600, h: 560, snap: "l", max: false, min: false });
    // The measured area and the drag hint are not part of the session.
    expect(saved.state.area).toBeUndefined();
    expect(saved.state.snapHint).toBeUndefined();

    useWindowStore.setState({ wins: [], focus: null });
    sessionStorage.setItem("intake-tracker-windows", JSON.stringify(saved));
    await useWindowStore.persist.rehydrate();
    expect(get(a.id)).toMatchObject({ x: 300, y: 140, w: 600, h: 560, snap: "l" });
  });

  it("gives windows stored without geometry (an older session) their default place", async () => {
    sessionStorage.setItem(
      "intake-tracker-windows",
      JSON.stringify({
        state: {
          wins: [
            { id: "w1", app: "meds", st: {}, z: 1, min: false, max: false },
            { id: "w2", app: "metrics", st: { tab: "summary" }, z: 2, min: false, max: false },
          ],
          focus: "w2",
          showHome: false,
          z: 2,
          nextId: 3,
        },
        version: 0,
      }),
    );
    await useWindowStore.persist.rehydrate();
    expect(rectOf("w1")).toEqual(defaultRect("meds", AREA, 0));
    expect(rectOf("w2")).toEqual(defaultRect("metrics", AREA, 1));
    expect(store().focus).toBe("w2");
  });

  it("outside desktop mode tidy only un-maximises (tiling derives the rects)", () => {
    useWindowStore.setState({ desktop: false });
    const a = store().open("meds")!.win;
    const before = rectOf(a.id);
    store().toggleMax(a.id);
    store().tidy();
    expect(get(a.id).max).toBe(false);
    expect(rectOf(a.id)).toEqual(before);
  });
});
