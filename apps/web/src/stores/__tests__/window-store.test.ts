// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const toast = vi.fn();
vi.mock("@intake/ui/use-toast", () => ({ toast: (...args: unknown[]) => toast(...args) }));

import {
  MAX_WINDOWS,
  MAX_WINDOWS_MESSAGE,
  defaultRect,
  layoutWindows,
  topWindow,
  useWindowStore,
  type Win,
} from "@/stores/window-store";

const store = () => useWindowStore.getState();

function reset(wide = false) {
  useWindowStore.setState({ wins: [], focus: null, showHome: true, wide, z: 0, nextId: 1 });
}

const win = (id: string, app: Win["app"], extra: Partial<Win> = {}): Win => ({
  id,
  app,
  st: {},
  z: 1,
  min: false,
  max: false,
  ...extra,
});

describe("window store", () => {
  beforeEach(() => {
    toast.mockReset();
    sessionStorage.clear();
    reset();
  });

  it("keeps one window per app: a second open focuses and updates the first", () => {
    const first = store().open("meds");
    expect(first?.created).toBe(true);
    store().open("metrics");
    expect(store().focus).not.toBe(first?.win.id);

    const again = store().open("meds");
    expect(again?.created).toBe(false);
    expect(again?.win.id).toBe(first?.win.id);
    expect(store().wins.filter((w) => w.app === "meds")).toHaveLength(1);
    expect(store().focus).toBe(first?.win.id);
    expect(store().showHome).toBe(false);
  });

  it("opens History as Metrics on Records, sharing the Metrics window", () => {
    const metrics = store().open("metrics");
    expect(metrics?.win.st.tab).toBe("summary");
    const history = store().open("history");
    expect(history?.created).toBe(false);
    expect(history?.win.id).toBe(metrics?.win.id);
    expect(store().wins).toHaveLength(1);
    expect(store().wins[0]?.st.tab).toBe("records");
  });

  it("does not open apps without a window (the manual)", () => {
    expect(store().open("help")).toBeNull();
    expect(store().wins).toHaveLength(0);
  });

  it(`stops at ${MAX_WINDOWS} windows with a toast`, () => {
    // Only three apps have windows, so fill the rest of the stack directly.
    useWindowStore.setState({
      wins: ["a", "b", "c", "d", "e", "f"].map((id) => win(id, "profile")),
      nextId: 7,
    });
    // A seventh distinct app would exceed the limit.
    const res = store().open("meds");
    expect(res).toBeNull();
    expect(store().wins).toHaveLength(MAX_WINDOWS);
    expect(toast).toHaveBeenCalledWith({ title: MAX_WINDOWS_MESSAGE });
  });

  it("an app that is already open still focuses at the limit", () => {
    useWindowStore.setState({
      wins: ["a", "b", "c", "d", "e"].map((id) => win(id, "profile")).concat(win("m", "meds")),
      nextId: 7,
    });
    expect(store().open("meds")?.win.id).toBe("m");
    expect(toast).not.toHaveBeenCalled();
  });

  it("focuses the top remaining window after closing the focused one", () => {
    const a = store().open("meds")!.win;
    const b = store().open("metrics")!.win;
    const c = store().open("profile")!.win;
    store().focusWin(a.id); // a is now on top, then c, then b
    store().close(a.id);
    expect(store().focus).toBe(c.id);
    store().close(c.id);
    expect(store().focus).toBe(b.id);
  });

  it("skips minimised windows when picking the next focus", () => {
    const a = store().open("meds")!.win;
    const b = store().open("metrics")!.win;
    store().minimise(a.id);
    expect(store().focus).toBe(b.id);
    store().close(b.id);
    expect(store().focus).toBeNull();
  });

  it("closing a background window keeps the focus", () => {
    const a = store().open("meds")!.win;
    const b = store().open("metrics")!.win;
    store().close(a.id);
    expect(store().focus).toBe(b.id);
    expect(store().wins.map((w) => w.id)).toEqual([b.id]);
  });

  it("returns to Home on a phone when the last window closes", () => {
    reset(false);
    const a = store().open("meds")!.win;
    expect(store().showHome).toBe(false);
    store().close(a.id);
    expect(store().focus).toBeNull();
    expect(store().showHome).toBe(true);
  });

  it("on a phone, closing the window on top shows the one underneath", () => {
    reset(false);
    const a = store().open("meds")!.win;
    const b = store().open("metrics")!.win;
    store().close(b.id);
    expect(store().focus).toBe(a.id);
    expect(store().showHome).toBe(false);
  });

  it("switchTo restores a minimised window and hides Home", () => {
    const a = store().open("meds")!.win;
    store().showDesktop();
    expect(store().wins[0]?.min).toBe(true);
    expect(store().showHome).toBe(true);
    store().switchTo(a.id);
    expect(store().wins[0]?.min).toBe(false);
    expect(store().focus).toBe(a.id);
    expect(store().showHome).toBe(false);
  });

  it("toggleMax and tidy", () => {
    const a = store().open("meds")!.win;
    store().toggleMax(a.id);
    expect(store().wins[0]?.max).toBe(true);
    store().tidy();
    expect(store().wins[0]?.max).toBe(false);
  });

  it("setSt merges window state", () => {
    const m = store().open("metrics")!.win;
    store().setSt(m.id, { tab: "titration" });
    expect(store().wins[0]?.st).toEqual({ tab: "titration" });
  });

  it("topWindow ignores minimised windows", () => {
    expect(topWindow([win("a", "meds", { z: 5, min: true }), win("b", "metrics", { z: 2 })])?.id).toBe("b");
    expect(topWindow([])).toBeNull();
  });
});

describe("layoutWindows (tidy geometry)", () => {
  const area = { w: 1280, h: 700 };

  it("puts a single window at its default size, top left", () => {
    const rects = layoutWindows([win("a", "meds")], area);
    expect(rects.a).toEqual({ x: 16, y: 12, w: 720, h: 520 });
    expect(defaultRect("metrics", area)).toEqual({ x: 16, y: 12, w: 880, h: 600 });
  });

  it("shrinks a single window to fit a small area", () => {
    expect(defaultRect("metrics", { w: 800, h: 500 })).toEqual({ x: 16, y: 12, w: 776, h: 480 });
  });

  it("tiles two or three windows in equal columns with 8px gutters", () => {
    const two = layoutWindows([win("a", "meds"), win("b", "metrics")], area);
    expect(two.a).toEqual({ x: 8, y: 8, w: 628, h: 684 });
    expect(two.b).toEqual({ x: 644, y: 8, w: 628, h: 684 });

    const three = layoutWindows([win("a", "meds"), win("b", "metrics"), win("c", "profile")], area);
    const cw = Math.floor((1280 - 8 * 4) / 3);
    expect(three.a).toEqual({ x: 8, y: 8, w: cw, h: 684 });
    expect(three.b?.x).toBe(8 + cw + 8);
    expect(three.c?.x).toBe(8 + 2 * (cw + 8));
    // Columns never overlap and stay inside the area.
    expect((three.c?.x ?? 0) + (three.c?.w ?? 0)).toBeLessThanOrEqual(area.w - 8);
  });

  it("uses a 2x2 grid for two or three windows under 900px", () => {
    const rects = layoutWindows([win("a", "meds"), win("b", "metrics")], { w: 800, h: 600 });
    expect(rects.a).toEqual({ x: 8, y: 8, w: 388, h: 288 });
    expect(rects.b).toEqual({ x: 404, y: 8, w: 388, h: 288 });
  });

  it("uses a 2x2 grid for four and 3x2 for five or six", () => {
    const four = layoutWindows(["a", "b", "c", "d"].map((id) => win(id, "profile")), area);
    expect(four.d).toEqual({ x: 644, y: 354, w: 628, h: 338 });
    const six = layoutWindows(["a", "b", "c", "d", "e", "f"].map((id) => win(id, "profile")), area);
    expect(Object.keys(six)).toHaveLength(6);
    expect(six.f?.x).toBe(Math.round(8 + (2 / 3) * (1280 - 8)));
    expect(six.f?.y).toBe(Math.round(8 + 0.5 * (700 - 8)));
  });

  it("fills the area with a maximised window and skips minimised ones", () => {
    const rects = layoutWindows(
      [win("a", "meds", { max: true }), win("b", "metrics"), win("c", "profile", { min: true })],
      area,
    );
    expect(rects.a).toEqual({ x: 0, y: 0, w: 1280, h: 700 });
    expect(rects.b).toEqual({ x: 16, y: 12, w: 880, h: 600 });
    expect(rects.c).toBeUndefined();
  });
});
