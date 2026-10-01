// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, within, fireEvent } from "@testing-library/react";

// The intake modules are windows on the desktop too; their cards are not under test here.
vi.mock("@/components/shell/desk-modules", () => ({ ModuleBody: ({ id }: { id: string }) => <p>{id} module</p> }));
vi.mock("@/components/shell/app-registry", () => ({
  WINDOW_APPS: {
    meds: {
      Body: () => {
        throw new Error("bad record");
      },
      Overlay: () => {
        throw new Error("bad overlay");
      },
    },
    metrics: { Body: () => <p>Metrics body</p> },
    profile: { Body: () => <p>Profile body</p> },
    help: { Body: () => <p>Help body</p> },
  },
}));
vi.mock("@/lib/error-log-service", () => ({ rawConsoleError: () => {}, logError: async () => undefined }));
const closeWindow = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-window-history", () => ({ closeWindow, goHome: vi.fn() }));

import { WindowLayer } from "@/components/shell/window-layer";
import { useWindowStore } from "@/stores/window-store";

describe("WindowLayer", () => {
  beforeEach(() => {
    closeWindow.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Wide: every open window is on screen.
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
    );
    useWindowStore.setState({
      wins: [
        { id: "w1", app: "meds", st: {}, z: 1, min: false, max: false, x: 16, y: 12, w: 720, h: 520 },
        { id: "w2", app: "metrics", st: {}, z: 2, min: false, max: false, x: 16, y: 12, w: 720, h: 520 },
      ],
      focus: "w2",
      showHome: false,
      wide: true,
      z: 2,
      nextId: 3,
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Windows are restored from sessionStorage on every load (including the
  // crash screen's hard load of /settings): one that throws while rendering
  // must not take the layer, and with it the whole shell, down.
  it("contains a crashing window: its frame and the other windows stay up", () => {
    render(<WindowLayer />);

    const meds = screen.getByRole("region", { name: "Medications" });
    expect(within(meds).getByText("Something went wrong")).toBeInTheDocument();
    expect(within(meds).getByRole("button", { name: /report this problem/i })).toBeInTheDocument();
    expect(screen.getByText("Metrics body")).toBeInTheDocument();

    // The crashed window can still be closed from its title bar.
    fireEvent.click(within(meds).getByRole("button", { name: "Close Medications" }));
    expect(closeWindow).toHaveBeenCalledWith("w1");
  });
});
