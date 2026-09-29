// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/components/shell/sys-bar", () => ({ useDueDoseCount: () => 2 }));

import { WindowsSwitcher, windowStateLabel } from "@/components/shell/windows-switcher";
import { useWindowStore, type Win } from "@/stores/window-store";

const wins: Win[] = [
  { id: "w1", app: "meds", st: {}, z: 1, min: false, max: false },
  { id: "w2", app: "metrics", st: { tab: "records" }, z: 2, min: false, max: false },
];

describe("WindowsSwitcher", () => {
  beforeEach(() => {
    useWindowStore.setState({ wins, focus: "w2", showHome: false, wide: false, z: 2, nextId: 3 });
  });

  it("lists every window with its state and the count", () => {
    render(<WindowsSwitcher open onOpenChange={() => {}} />);
    expect(screen.getByText(/Windows ·/)).toHaveTextContent("Windows · 2 open");
    const rows = screen.getAllByTestId("switcher-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Medications")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Schedule · 2 open")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Records")).toBeInTheDocument();
    // The window on screen is marked.
    expect(within(rows[1]!).getByRole("button", { name: /^Metrics/ })).toHaveAttribute("aria-current", "true");
    // Phone: no wide-screen arrange actions.
    expect(screen.queryByRole("button", { name: /Arrange side by side/ })).not.toBeInTheDocument();
  });

  it("switches to a window and closes the sheet", () => {
    const onOpenChange = vi.fn();
    const onSwitch = vi.fn();
    render(<WindowsSwitcher open onOpenChange={onOpenChange} onSwitch={onSwitch} />);
    fireEvent.click(screen.getByRole("button", { name: /^Medications/ }));
    expect(useWindowStore.getState().focus).toBe("w1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSwitch).toHaveBeenCalled();
  });

  it("closes a window from its row; the sheet closes with the last one", () => {
    const onOpenChange = vi.fn();
    render(<WindowsSwitcher open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Close Medications" }));
    expect(useWindowStore.getState().wins.map((w) => w.id)).toEqual(["w2"]);
    expect(screen.getAllByTestId("switcher-row")).toHaveLength(1);
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close Metrics" }));
    expect(useWindowStore.getState().wins).toHaveLength(0);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("wide: arrange side by side and show desktop", () => {
    useWindowStore.setState({ wide: true, wins: wins.map((w) => ({ ...w, max: true })) });
    const onOpenChange = vi.fn();
    render(<WindowsSwitcher open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Arrange side by side/ }));
    expect(useWindowStore.getState().wins.every((w) => !w.max)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Show desktop/ }));
    expect(useWindowStore.getState().wins.every((w) => w.min)).toBe(true);
    expect(useWindowStore.getState().showHome).toBe(true);
  });

  it("says so when nothing is open", () => {
    useWindowStore.setState({ wins: [], focus: null });
    render(<WindowsSwitcher open onOpenChange={() => {}} />);
    expect(screen.getByText(/No windows are open/)).toBeInTheDocument();
  });
});

describe("windowStateLabel", () => {
  it("describes each window", () => {
    const meds = { tab: "prescriptions" as const, due: 0 };
    expect(windowStateLabel(wins[0]!, meds)).toBe("Rx · all handled");
    expect(windowStateLabel({ ...wins[1]!, st: {} }, meds)).toBe("Summary");
    expect(windowStateLabel({ id: "p", app: "profile", st: {}, z: 1, min: true, max: false }, meds)).toBe(
      "Minimised",
    );
  });
});
