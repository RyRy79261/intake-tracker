// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";

const push = vi.fn();
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));
const goHome = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-window-history", () => ({ goHome, SETTINGS_PATH: "/settings" }));
vi.mock("@intake/ui/use-toast", () => ({ toast: vi.fn() }));

import { TaskStrip } from "@/components/shell/task-strip";
import { useWindowStore, type Win } from "@/stores/window-store";
import { useSettingsSheetStore } from "@/stores/settings-sheet-store";
import { useModuleWindowStore } from "@/stores/module-window-store";
import { MODULE_IDS, arrangeModules } from "@/lib/desk-modules";

const win = (id: string, app: Win["app"], extra: Partial<Win> = {}): Win => ({
  id,
  app,
  st: {},
  z: 1,
  min: false,
  max: false,
  x: 16,
  y: 12,
  w: 720,
  h: 520,
  ...extra,
});

const store = () => useWindowStore.getState();
const task = (name: string) => within(screen.getByRole("toolbar", { name: "Open windows" })).getByRole("button", { name });

describe("TaskStrip", () => {
  beforeEach(() => {
    push.mockReset();
    goHome.mockReset();
    pathname = "/";
    sessionStorage.clear();
    useSettingsSheetStore.setState({ open: false, page: "main" });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    useWindowStore.setState({
      wins: [win("w1", "meds", { z: 1 }), win("w2", "metrics", { z: 2 }), win("w3", "profile", { z: 3, min: true })],
      focus: "w2",
      showHome: false,
      wide: true,
      desktop: true,
      area: { w: 1440, h: 856 },
      z: 3,
      nextId: 4,
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("has one button per open window, with its icon, title and state", () => {
    render(<TaskStrip />);
    const bar = screen.getByRole("toolbar", { name: "Open windows" });
    expect(within(bar).getAllByRole("button")).toHaveLength(3);

    const meds = task("Medications window");
    expect(meds).toHaveTextContent("Medications");
    expect(meds.querySelector("svg")).not.toBeNull();
    expect(meds).toHaveAttribute("aria-pressed", "false");
    // The focused window's button is the active one.
    expect(task("Metrics window")).toHaveAttribute("aria-pressed", "true");
    // A minimised window says so, and is drawn dashed.
    const profile = task("Profile window, minimised");
    expect(profile).toHaveAttribute("aria-pressed", "false");
    expect(profile).toHaveAttribute("data-min", "true");
    expect(profile).toHaveClass("border-dashed");
  });

  it("clicking a background window's button focuses and raises it", () => {
    render(<TaskStrip />);
    fireEvent.click(task("Medications window"));
    expect(store().focus).toBe("w1");
    expect(store().wins[0]?.z).toBe(4);
    expect(task("Medications window")).toHaveAttribute("aria-pressed", "true");
    expect(task("Metrics window")).toHaveAttribute("aria-pressed", "false");
    expect(push).not.toHaveBeenCalled();
  });

  it("clicking the focused window's button minimises it; again restores it", () => {
    render(<TaskStrip />);
    fireEvent.click(task("Metrics window"));
    expect(store().wins[1]?.min).toBe(true);
    // Focus falls to the window now on top.
    expect(store().focus).toBe("w1");

    fireEvent.click(task("Metrics window, minimised"));
    expect(store().wins[1]?.min).toBe(false);
    expect(store().focus).toBe("w2");
    expect(task("Metrics window")).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking a minimised window's button restores and focuses it", () => {
    render(<TaskStrip />);
    fireEvent.click(task("Profile window, minimised"));
    expect(store().wins[2]?.min).toBe(false);
    expect(store().focus).toBe("w3");
    expect(store().showHome).toBe(false);
  });

  it("moves keyboard focus into the window it shows", () => {
    render(
      <>
        <TaskStrip />
        <h2 id="wt-w1" tabIndex={-1}>
          Medications
        </h2>
      </>,
    );
    fireEvent.click(task("Medications window"));
    expect(screen.getByRole("heading", { name: "Medications" })).toHaveFocus();
  });

  it("from another route, a window's button returns to the windows", () => {
    pathname = "/privacy";
    render(<TaskStrip />);
    // Nothing is on screen there, so no button is active.
    expect(task("Metrics window")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(task("Metrics window"));
    expect(store().focus).toBe("w2");
    expect(push).toHaveBeenCalledWith("/analytics");
  });

  it("Home shows the desktop, and is active when no window is on screen", () => {
    render(<TaskStrip />);
    const home = screen.getByRole("button", { name: "Home" });
    expect(home).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(home);
    expect(goHome).toHaveBeenCalledWith(true);
    expect(push).not.toHaveBeenCalled();

    useWindowStore.setState({ wins: store().wins.map((w) => ({ ...w, min: true })), focus: null });
    cleanup();
    render(<TaskStrip />);
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-pressed", "true");
  });

  it("Home on another route goes back to /", () => {
    pathname = "/privacy";
    render(<TaskStrip />);
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(goHome).toHaveBeenCalledWith(false);
    expect(push).toHaveBeenCalledWith("/");
  });

  it("Tidy arranges the visible app windows side by side", () => {
    render(<TaskStrip />);
    fireEvent.click(screen.getByRole("button", { name: "Tidy windows" }));
    const [a, b, c] = store().wins;
    expect(a).toMatchObject({ x: 8, y: 8, w: 708, h: 840 });
    expect(b).toMatchObject({ x: 724, y: 8, w: 708, h: 840 });
    // The minimised window keeps its place.
    expect(c).toMatchObject({ x: 16, y: 12, w: 720, h: 520, min: true });
  });

  it("Tidy puts every module back in the default arrangement, open", () => {
    const mods = () => useModuleWindowStore.getState();
    const area = store().area;
    mods().arrange(area);
    mods().moveWin("food", 30, 30);
    mods().minimise("liquids");
    mods().toggleMax("today");
    render(<TaskStrip />);
    fireEvent.click(screen.getByRole("button", { name: "Tidy windows" }));
    const expected = arrangeModules(area);
    for (const id of MODULE_IDS) {
      const { x, y, w, h, min, max } = mods().wins[id];
      expect({ x, y, w, h }).toEqual(expected[id]);
      expect(min || max).toBe(false);
    }
  });

  it("lists app windows only: the modules have no buttons here", () => {
    render(<TaskStrip />);
    const names = within(screen.getByRole("toolbar", { name: "Open windows" }))
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Medications window", "Metrics window", "Profile window, minimised"]);
  });

  it("has no window buttons when no app is open; Tidy is still there for the modules", () => {
    useWindowStore.setState({ wins: [], focus: null, showHome: true });
    render(<TaskStrip />);
    expect(within(screen.getByRole("toolbar", { name: "Open windows" })).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Tidy windows" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-pressed", "true");
  });

  it("every control is at least 32px tall", () => {
    render(<TaskStrip />);
    for (const b of screen.getAllByRole("button")) expect(b).toHaveClass("h-8");
  });
});
