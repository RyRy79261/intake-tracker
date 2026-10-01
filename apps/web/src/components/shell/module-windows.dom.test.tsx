// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/components/shell/app-registry", () => ({
  WINDOW_APPS: {
    meds: { Body: () => <p>Meds body</p> },
    metrics: { Body: () => <p>Metrics body</p> },
    profile: { Body: () => <p>Profile body</p> },
    help: { Body: () => <p>Help body</p> },
  },
}));
vi.mock("@/components/shell/desk-modules", () => ({
  ModuleBody: ({ id }: { id: string }) => <p>{id} body</p>,
}));
vi.mock("@/lib/error-log-service", () => ({ rawConsoleError: () => {}, logError: async () => undefined }));
const closeWindow = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-window-history", () => ({ closeWindow, goHome: vi.fn() }));
vi.mock("@intake/ui/use-toast", () => ({ toast: vi.fn() }));

import { WindowLayer, cycleAll } from "@/components/shell/window-layer";
import { arrangeModules, MODULE_IDS } from "@/lib/desk-modules";
import { useModuleWindowStore } from "@/stores/module-window-store";
import { useWindowStore } from "@/stores/window-store";

const AREA = { w: 1440, h: 784 };
const mods = () => useModuleWindowStore.getState();
const apps = () => useWindowStore.getState();

function pointer(el: Element, type: string, clientX: number, clientY: number) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 }));
}

const moduleWindows = () => screen.queryAllByTestId("module-window");
const moduleWin = (id: string) => moduleWindows().find((el) => el.getAttribute("data-app") === id) as HTMLElement;

let desktop = true;

describe("module windows in the window layer", () => {
  beforeEach(() => {
    desktop = true;
    closeWindow.mockClear();
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          // Off the desktop: wide enough to tile, no fine pointer.
          matches: desktop || !query.includes("pointer"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    useWindowStore.setState({
      wins: [],
      focus: null,
      showHome: true,
      wide: true,
      desktop: true,
      area: AREA,
      snapHint: null,
      z: 0,
      nextId: 1,
    });
    useModuleWindowStore.setState({ focus: null, arranged: false });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.windowGesture;
  });

  it("first run: all seven modules are windows, in the default arrangement", () => {
    render(<WindowLayer />);
    expect(mods().arranged).toBe(true);
    expect(moduleWindows().map((el) => el.getAttribute("data-app"))).toEqual([...MODULE_IDS]);
    const expected = arrangeModules(AREA);
    for (const id of MODULE_IDS) {
      const el = moduleWin(id);
      expect(el).toHaveClass("flex");
      expect(el.style.left).toBe(`${expected[id].x}px`);
      expect(el.style.top).toBe(`${expected[id].y}px`);
      expect(el.style.width).toBe(`${expected[id].w}px`);
      expect(el.style.height).toBe(`${expected[id].h}px`);
      expect(el).toHaveAttribute("data-free", "true");
      expect(within(el).getByText(`${id} body`)).toBeInTheDocument();
    }
    // Each is a labelled region with the same controls as an app window.
    const liquids = screen.getByRole("region", { name: "Liquids" });
    expect(within(liquids).getByRole("button", { name: "Minimise Liquids" })).toBeInTheDocument();
    expect(within(liquids).getByRole("button", { name: "Maximise Liquids" })).toBeInTheDocument();
    expect(liquids.querySelectorAll("[data-grip]")).toHaveLength(8);
    // Nothing takes the keyboard focus on load.
    expect(document.body).toHaveFocus();
  });

  it("keeps where the modules were put: no second arrangement on the next load", () => {
    mods().arrange(AREA);
    mods().moveWin("food", 40, 40);
    render(<WindowLayer />);
    expect(moduleWin("food").style.left).toBe("40px");
  });

  it("are not there off the desktop (tiled tablets and phones keep Home)", () => {
    desktop = false;
    render(<WindowLayer />);
    expect(moduleWindows()).toHaveLength(0);
    expect(mods().arranged).toBe(false);
  });

  it("drag and resize work like an app window", () => {
    render(<WindowLayer />);
    const el = moduleWin("liquids");
    const before = { x: parseInt(el.style.left), y: parseInt(el.style.top), w: parseInt(el.style.width) };
    const bar = within(el).getByTestId("window-titlebar");
    pointer(bar, "pointerdown", 800, 60);
    pointer(bar, "pointermove", 700, 160);
    pointer(bar, "pointerup", 700, 160);
    expect(el.style.left).toBe(`${before.x - 100}px`);
    expect(el.style.top).toBe(`${before.y + 100}px`);
    expect(el).toHaveAttribute("data-focused", "true");

    const grip = el.querySelector('[data-grip="e"]') as HTMLElement;
    pointer(grip, "pointerdown", 1000, 300);
    pointer(grip, "pointermove", 1080, 300);
    pointer(grip, "pointerup", 1080, 300);
    expect(el.style.width).toBe(`${before.w + 80}px`);
  });

  it("minimise hides the window and keeps it mounted; close does the same", () => {
    render(<WindowLayer />);
    fireEvent.click(within(moduleWin("liquids")).getByRole("button", { name: "Minimise Liquids" }));
    expect(mods().wins.liquids.min).toBe(true);
    expect(moduleWin("liquids")).toHaveClass("hidden");
    expect(within(moduleWin("liquids")).getByText("liquids body")).toBeInTheDocument();

    fireEvent.click(within(moduleWin("food")).getByRole("button", { name: "Close Food" }));
    expect(mods().wins.food.min).toBe(true);
    expect(moduleWin("food")).toHaveClass("hidden");
    // Still seven: a module can never be lost, and no app window was closed.
    expect(moduleWindows()).toHaveLength(7);
    expect(closeWindow).not.toHaveBeenCalled();

    act(() => mods().restore("liquids"));
    expect(moduleWin("liquids")).toHaveClass("flex");
  });

  it("minimising hands keyboard focus to the module's desk icon", () => {
    render(
      <>
        <WindowLayer />
        <button type="button" data-desk-icon="bp">
          Open Blood Pressure
        </button>
      </>,
    );
    fireEvent.click(within(moduleWin("bp")).getByRole("button", { name: "Minimise Blood Pressure" }));
    expect(screen.getByRole("button", { name: "Open Blood Pressure" })).toHaveFocus();
  });

  it("share one stacking order with the app windows; a click raises either kind", () => {
    render(<WindowLayer />);
    act(() => {
      apps().open("meds");
    });
    const meds = screen.getByRole("region", { name: "Medications" });
    const z = (el: HTMLElement) => Number(el.style.zIndex);
    for (const id of MODULE_IDS) expect(z(meds)).toBeGreaterThan(z(moduleWin(id)));
    expect(meds).toHaveAttribute("data-focused", "true");

    fireEvent.pointerDown(within(moduleWin("today")).getByText("today body"));
    expect(z(moduleWin("today"))).toBeGreaterThan(z(meds));
    expect(moduleWin("today")).toHaveAttribute("data-focused", "true");
    expect(meds).toHaveAttribute("data-focused", "false");

    fireEvent.pointerDown(within(meds).getByText("Meds body"));
    expect(z(meds)).toBeGreaterThan(z(moduleWin("today")));
    expect(moduleWin("today")).toHaveAttribute("data-focused", "false");
  });

  it("a maximised window puts everything under it out of reach", () => {
    render(<WindowLayer />);
    act(() => mods().toggleMax("food"));
    expect(moduleWin("food")).not.toHaveAttribute("inert");
    expect(moduleWin("liquids")).toHaveAttribute("inert");
    act(() => mods().toggleMax("food"));
    expect(moduleWin("liquids")).not.toHaveAttribute("inert");
  });

  it("Ctrl+` goes round the modules and the app windows on screen", () => {
    render(<WindowLayer />);
    act(() => {
      apps().open("meds");
      mods().minimise("liquids");
    });
    const order: string[] = [];
    for (let i = 0; i < 8; i++) {
      act(() => {
        order.push(cycleAll(1)!);
      });
    }
    // From the app window: every module on screen (not the minimised one), then the app again.
    expect(order).toEqual(["m-today", "m-food", "m-bp", "m-weight", "m-wee", "m-bowel", "w1", "m-today"]);
    expect(mods().focus).toBe("today");
    expect(apps().focus).toBeNull();

    fireEvent.keyDown(document.body, { key: "`", code: "Backquote", ctrlKey: true, shiftKey: true });
    expect(apps().focus).toBe("w1");
  });
});
