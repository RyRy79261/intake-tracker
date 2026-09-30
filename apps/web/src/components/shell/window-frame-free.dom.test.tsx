// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";

// The intake modules are windows on the desktop too; their cards are not under test here.
vi.mock("@/components/shell/desk-modules", () => ({ ModuleBody: ({ id }: { id: string }) => <p>{id} module</p> }));
vi.mock("@/components/shell/app-registry", () => ({
  WINDOW_APPS: {
    meds: { Body: () => <p>Meds body</p> },
    metrics: { Body: () => <p>Metrics body</p> },
    profile: { Body: () => <p>Profile body</p> },
    help: { Body: () => <p>Help body</p> },
  },
}));
vi.mock("@/lib/error-log-service", () => ({ rawConsoleError: () => {}, logError: async () => undefined }));
const closeWindow = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-window-history", () => ({ closeWindow, goHome: vi.fn() }));
vi.mock("@intake/ui/use-toast", () => ({ toast: vi.fn() }));

import { DRAG_SLOP_PX, WindowFrame, type FreeWindowHandlers } from "@/components/shell/window-frame";
import { WindowLayer } from "@/components/shell/window-layer";
import { useWindowStore, type Rect, type Win } from "@/stores/window-store";

const RECT: Rect = { x: 100, y: 80, w: 720, h: 520 };
const meds: Win = { id: "w1", app: "meds", st: {}, z: 3, min: false, max: false, ...RECT };

/** A pointer event with a position; React only needs the event's name. */
function pointer(el: Element, type: string, clientX: number, clientY: number, button = 0) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button }));
}

function freeHandlers(): { [K in keyof FreeWindowHandlers]: ReturnType<typeof vi.fn> } {
  return {
    beginDrag: vi.fn(() => RECT),
    drag: vi.fn(),
    beginResize: vi.fn(() => RECT),
    resize: vi.fn(),
    end: vi.fn(),
    nudge: vi.fn(),
  };
}

function setup(win: Win = meds) {
  const free = freeHandlers();
  const handlers = { onClose: vi.fn(), onHome: vi.fn(), onMinimise: vi.fn(), onToggleMax: vi.fn(), onFocus: vi.fn() };
  render(
    <WindowFrame
      win={win}
      index={1}
      total={1}
      phone={false}
      visible
      focused
      rect={RECT}
      free={free as unknown as FreeWindowHandlers}
      {...handlers}
    >
      <p>Body content</p>
    </WindowFrame>,
  );
  return { free, ...handlers, bar: screen.getByTestId("window-titlebar") };
}

afterEach(cleanup);

describe("WindowFrame on the desktop (free)", () => {
  it("drags by the title bar: pointer down, move, up", () => {
    const { free, bar } = setup();
    pointer(bar, "pointerdown", 300, 100);
    // A press that has not moved yet is not a drag.
    pointer(bar, "pointermove", 300 + DRAG_SLOP_PX - 1, 100);
    expect(free.beginDrag).not.toHaveBeenCalled();

    pointer(bar, "pointermove", 310, 104);
    expect(free.beginDrag).toHaveBeenCalledWith(300, 100);
    expect(free.drag).toHaveBeenLastCalledWith(RECT.x + 10, RECT.y + 4, 310, 104);
    pointer(bar, "pointermove", 360, 154);
    expect(free.drag).toHaveBeenLastCalledWith(RECT.x + 60, RECT.y + 54, 360, 154);
    pointer(bar, "pointermove", 210, 84);
    expect(free.drag).toHaveBeenLastCalledWith(RECT.x - 90, RECT.y - 16, 210, 84);

    pointer(bar, "pointerup", 210, 84);
    expect(free.end).toHaveBeenCalledWith("move");
    // The pointer is free again: later moves do nothing.
    free.drag.mockClear();
    pointer(bar, "pointermove", 500, 500);
    expect(free.drag).not.toHaveBeenCalled();
  });

  it("captures the pointer, so the drag carries on over other windows", () => {
    const { bar } = setup();
    const capture = vi.fn();
    (bar as HTMLElement & { setPointerCapture: unknown }).setPointerCapture = capture;
    pointer(bar, "pointerdown", 300, 100);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("a click on the title bar is not a drag, and neither is a press on a control", () => {
    const { free, bar, onMinimise } = setup();
    pointer(bar, "pointerdown", 300, 100);
    pointer(bar, "pointerup", 300, 100);
    expect(free.beginDrag).not.toHaveBeenCalled();
    expect(free.end).not.toHaveBeenCalled();

    const min = screen.getByRole("button", { name: "Minimise Medications" });
    pointer(min, "pointerdown", 700, 100);
    pointer(bar, "pointermove", 760, 160);
    expect(free.beginDrag).not.toHaveBeenCalled();
    fireEvent.click(min);
    expect(onMinimise).toHaveBeenCalledTimes(1);
  });

  it("ignores the right mouse button", () => {
    const { free, bar } = setup();
    pointer(bar, "pointerdown", 300, 100, 2);
    pointer(bar, "pointermove", 400, 200, 2);
    expect(free.beginDrag).not.toHaveBeenCalled();
  });

  it("resizes from each of the eight grips", () => {
    const { free } = setup();
    const region = screen.getByRole("region", { name: "Medications" });
    const grips = region.querySelectorAll("[data-grip]");
    expect([...grips].map((g) => g.getAttribute("data-grip")).sort()).toEqual(
      ["e", "n", "ne", "nw", "s", "se", "sw", "w"].sort(),
    );
    for (const g of grips) expect(g).toHaveAttribute("aria-hidden", "true");

    const se = region.querySelector('[data-grip="se"]') as HTMLElement;
    pointer(se, "pointerdown", 820, 600);
    expect(free.beginResize).toHaveBeenCalledTimes(1);
    pointer(se, "pointermove", 860, 570);
    expect(free.resize).toHaveBeenLastCalledWith(RECT, "se", 40, -30);
    pointer(se, "pointerup", 860, 570);
    expect(free.end).toHaveBeenCalledWith("resize");

    const w = region.querySelector('[data-grip="w"]') as HTMLElement;
    pointer(w, "pointerdown", 100, 300);
    pointer(w, "pointermove", 60, 300);
    expect(free.resize).toHaveBeenLastCalledWith(RECT, "w", -40, 0);
    pointer(w, "pointercancel", 60, 300);
    expect(free.end).toHaveBeenCalledTimes(2);
  });

  it("a maximised window has no grips", () => {
    setup({ ...meds, max: true });
    const region = screen.getByRole("region", { name: "Medications" });
    expect(region.querySelectorAll("[data-grip]")).toHaveLength(0);
    expect(region).toHaveAttribute("data-max", "true");
  });

  it("double-click on the title bar toggles maximise, but not on a control", () => {
    const { bar, onToggleMax } = setup();
    fireEvent.doubleClick(bar);
    expect(onToggleMax).toHaveBeenCalledTimes(1);
    fireEvent.doubleClick(screen.getByRole("button", { name: "Close Medications" }));
    expect(onToggleMax).toHaveBeenCalledTimes(1);
  });

  it("arrow keys on the title move the window; with Shift they resize it", () => {
    const { free } = setup();
    const title = screen.getByRole("heading", { name: "Medications" });
    expect(title).toHaveAttribute("tabindex", "0");
    expect(title).toHaveAccessibleDescription(/Arrow keys move this window/);

    fireEvent.keyDown(title, { key: "ArrowRight" });
    expect(free.nudge).toHaveBeenLastCalledWith(1, 0, false);
    fireEvent.keyDown(title, { key: "ArrowUp" });
    expect(free.nudge).toHaveBeenLastCalledWith(0, -1, false);
    fireEvent.keyDown(title, { key: "ArrowLeft", shiftKey: true });
    expect(free.nudge).toHaveBeenLastCalledWith(-1, 0, true);
    fireEvent.keyDown(title, { key: "ArrowDown", shiftKey: true });
    expect(free.nudge).toHaveBeenLastCalledWith(0, 1, true);
    // Other keys, and browser shortcuts, are left alone.
    free.nudge.mockClear();
    fireEvent.keyDown(title, { key: "a" });
    fireEvent.keyDown(title, { key: "ArrowLeft", altKey: true });
    expect(free.nudge).not.toHaveBeenCalled();
  });

  it("controls are at least 32px on the desktop", () => {
    setup();
    for (const name of ["Minimise Medications", "Maximise Medications", "Close Medications"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("h-8", "w-8");
    }
  });

  it("without free handlers (tiled) the title bar does not drag and has no grips", () => {
    const onToggleMax = vi.fn();
    render(
      <WindowFrame
        win={meds}
        index={1}
        total={1}
        phone={false}
        visible
        focused
        rect={RECT}
        onClose={vi.fn()}
        onHome={vi.fn()}
        onMinimise={vi.fn()}
        onToggleMax={onToggleMax}
        onFocus={vi.fn()}
      >
        <p>Body content</p>
      </WindowFrame>,
    );
    const region = screen.getByRole("region", { name: "Medications" });
    expect(region.querySelectorAll("[data-grip]")).toHaveLength(0);
    expect(region).not.toHaveAttribute("data-free");
    fireEvent.doubleClick(screen.getByTestId("window-titlebar"));
    expect(onToggleMax).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Medications" })).toHaveAttribute("tabindex", "-1");
  });
});

describe("WindowLayer on the desktop", () => {
  const AREA = { w: 1440, h: 856 };

  beforeEach(() => {
    closeWindow.mockClear();
    sessionStorage.clear();
    // Desktop: both the wide and the desktop query match.
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
    );
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    useWindowStore.setState({
      wins: [
        { id: "w1", app: "meds", st: {}, z: 1, min: false, max: false, x: 16, y: 12, w: 720, h: 520 },
        { id: "w2", app: "metrics", st: {}, z: 2, min: false, max: false, x: 300, y: 100, w: 880, h: 600 },
      ],
      focus: "w2",
      showHome: false,
      wide: true,
      desktop: true,
      area: AREA,
      snapHint: null,
      z: 2,
      nextId: 3,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.windowGesture;
  });

  const region = (name: string) => screen.getByRole("region", { name });
  const bar = (name: string) => within(region(name)).getByTestId("window-titlebar");

  it("places each window by its own geometry and stacking order", () => {
    render(<WindowLayer />);
    expect(screen.getByTestId("window-layer")).toHaveAttribute("data-mode", "desktop");
    expect(region("Medications").style.left).toBe("16px");
    expect(region("Medications").style.width).toBe("720px");
    expect(region("Metrics").style.left).toBe("300px");
    expect(region("Metrics").style.zIndex).toBe("2");
    expect(region("Medications")).toHaveAttribute("data-free", "true");
  });

  it("a pointer drag on the title bar moves the window", () => {
    render(<WindowLayer />);
    const metrics = bar("Metrics");
    pointer(metrics, "pointerdown", 500, 160);
    pointer(metrics, "pointermove", 510, 170);
    expect(document.documentElement.dataset.windowGesture).toBe("true");
    pointer(metrics, "pointermove", 610, 250);
    expect(region("Metrics").style.left).toBe("410px");
    expect(region("Metrics").style.top).toBe("190px");
    pointer(metrics, "pointerup", 610, 250);
    expect(document.documentElement.dataset.windowGesture).toBeUndefined();
    expect(useWindowStore.getState().wins[1]).toMatchObject({ x: 410, y: 190, w: 880, h: 600 });
  });

  it("a pointer drag on a grip resizes the window", () => {
    render(<WindowLayer />);
    const grip = region("Metrics").querySelector('[data-grip="se"]') as HTMLElement;
    pointer(grip, "pointerdown", 1180, 744);
    pointer(grip, "pointermove", 1080, 700);
    expect(region("Metrics").style.width).toBe("780px");
    expect(region("Metrics").style.height).toBe("556px");
    pointer(grip, "pointerup", 1080, 700);
    expect(useWindowStore.getState().wins[1]).toMatchObject({ x: 300, y: 100, w: 780, h: 556 });
  });

  it("pressing a window behind raises and focuses it", () => {
    render(<WindowLayer />);
    expect(region("Metrics")).toHaveAttribute("data-focused", "true");
    fireEvent.pointerDown(within(region("Medications")).getByText("Meds body"));
    expect(region("Medications")).toHaveAttribute("data-focused", "true");
    expect(Number(region("Medications").style.zIndex)).toBeGreaterThan(Number(region("Metrics").style.zIndex));
  });

  it("dragging to the left edge shows where it will snap, then snaps to that half", () => {
    render(<WindowLayer />);
    const metrics = bar("Metrics");
    pointer(metrics, "pointerdown", 500, 160);
    pointer(metrics, "pointermove", 490, 160);
    expect(screen.queryByTestId("snap-hint")).not.toBeInTheDocument();
    pointer(metrics, "pointermove", 2, 300);
    expect(screen.getByTestId("snap-hint")).toBeInTheDocument();
    pointer(metrics, "pointerup", 2, 300);
    expect(screen.queryByTestId("snap-hint")).not.toBeInTheDocument();
    expect(region("Metrics")).toHaveAttribute("data-snap", "l");
    expect(region("Metrics").style.left).toBe("0px");
    expect(region("Metrics").style.width).toBe("720px");
    expect(region("Metrics").style.height).toBe("856px");
  });

  it("double-click maximises and restores", () => {
    render(<WindowLayer />);
    fireEvent.doubleClick(bar("Metrics"));
    expect(region("Metrics").style.width).toBe("1440px");
    expect(region("Metrics").style.height).toBe("856px");
    expect(within(region("Metrics")).getByRole("button", { name: "Restore Metrics" })).toBeInTheDocument();
    fireEvent.doubleClick(bar("Metrics"));
    expect(region("Metrics").style.left).toBe("300px");
    expect(region("Metrics").style.width).toBe("880px");
  });

  it("arrow keys move the focused window by 16px and Shift+arrows resize it", () => {
    render(<WindowLayer />);
    const title = within(region("Metrics")).getByRole("heading", { name: "Metrics" });
    fireEvent.keyDown(title, { key: "ArrowRight" });
    fireEvent.keyDown(title, { key: "ArrowDown" });
    expect(region("Metrics").style.left).toBe("316px");
    expect(region("Metrics").style.top).toBe("116px");
    fireEvent.keyDown(title, { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(title, { key: "ArrowUp", shiftKey: true });
    expect(region("Metrics").style.width).toBe("864px");
    expect(region("Metrics").style.height).toBe("584px");
  });

  it("Ctrl+` cycles through the windows and moves keyboard focus into each", () => {
    render(<WindowLayer />);
    // Backwards from Metrics: Medications, the app window before it.
    fireEvent.keyDown(document.body, { key: "`", code: "Backquote", ctrlKey: true, shiftKey: true });
    expect(useWindowStore.getState().focus).toBe("w1");
    expect(within(region("Medications")).getByRole("heading", { name: "Medications" })).toHaveFocus();
    fireEvent.keyDown(document.body, { key: "`", code: "Backquote", altKey: true });
    expect(useWindowStore.getState().focus).toBe("w2");
    expect(within(region("Metrics")).getByRole("heading", { name: "Metrics" })).toHaveFocus();
  });

  it("a window moved off the edge by a smaller viewport is drawn back on screen", () => {
    useWindowStore.setState({ area: { w: 1024, h: 600 } });
    render(<WindowLayer />);
    const r = region("Metrics").style;
    expect(parseInt(r.left) + parseInt(r.width)).toBeLessThanOrEqual(1024);
    expect(parseInt(r.top) + parseInt(r.height)).toBeLessThanOrEqual(600);
  });
});
