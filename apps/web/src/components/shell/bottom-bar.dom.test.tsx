// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const push = vi.fn();
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

const mockUseAuthGate = vi.fn();
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => mockUseAuthGate(),
}));

// The mic's recording and review flow is covered by hold-to-talk.dom.test.
vi.mock("@/components/shell/hold-to-talk", () => ({
  HoldToTalk: () => <button type="button">Hold to talk</button>,
}));

// The sheet's contents are covered by log-sheet.dom.test.
vi.mock("@/components/shell/log-sheet", () => ({
  LogSheet: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Log sheet" /> : null),
}));

// The switcher's contents are covered by windows-switcher.dom.test.
vi.mock("@/components/shell/windows-switcher", () => ({
  WindowsSwitcher: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Windows switcher" /> : null,
}));

import { BottomBar } from "@/components/shell/bottom-bar";
import { useWindowStore } from "@/stores/window-store";

describe("BottomBar", () => {
  beforeEach(() => {
    push.mockReset();
    pathname = "/";
    useWindowStore.setState({ wins: [], focus: null, showHome: true, wide: false, z: 0, nextId: 1 });
    window.history.replaceState(null, "", "/");
    mockUseAuthGate.mockReset();
  });

  it("hides Hold to talk when signed out", () => {
    mockUseAuthGate.mockReturnValue(false);
    render(<BottomBar />);
    expect(screen.queryByRole("button", { name: "Hold to talk" })).not.toBeInTheDocument();
    // The other three cells are still there.
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Windows/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log" })).toBeInTheDocument();
  });

  it("shows Hold to talk when signed in", () => {
    mockUseAuthGate.mockReturnValue(true);
    render(<BottomBar />);
    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeInTheDocument();
  });

  it("opens the Log sheet from the Log cell", () => {
    mockUseAuthGate.mockReturnValue(false);
    render(<BottomBar />);
    const log = screen.getByRole("button", { name: "Log" });
    expect(log).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(log);
    expect(log).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Log sheet" })).toBeInTheDocument();
    // Home is not "on" while the sheet covers it.
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks Home on the home route and navigates there from elsewhere", () => {
    mockUseAuthGate.mockReturnValue(false);
    const { unmount } = render(<BottomBar />);
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-pressed", "true");
    unmount();

    pathname = "/settings";
    render(<BottomBar />);
    const home = screen.getByRole("button", { name: "Home" });
    expect(home).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(home);
    expect(push).toHaveBeenCalledWith("/");
  });

  it("Home closes the window on screen (phone)", () => {
    mockUseAuthGate.mockReturnValue(false);
    useWindowStore.getState().open("meds");
    pathname = "/medications";
    render(<BottomBar />);
    const home = screen.getByRole("button", { name: "Home" });
    expect(home).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(home);
    expect(useWindowStore.getState().wins).toHaveLength(0);
    expect(useWindowStore.getState().showHome).toBe(true);
    expect(home).toHaveAttribute("aria-pressed", "true");
    expect(push).not.toHaveBeenCalled();
  });

  it("Home from Settings keeps the window that was open (phone)", () => {
    mockUseAuthGate.mockReturnValue(false);
    useWindowStore.getState().open("meds");
    pathname = "/settings";
    render(<BottomBar />);
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(useWindowStore.getState().wins.map((w) => w.app)).toEqual(["meds"]);
    expect(useWindowStore.getState().showHome).toBe(true);
    expect(push).toHaveBeenCalledWith("/");
  });

  it("Home minimises every window on a wide screen", () => {
    mockUseAuthGate.mockReturnValue(false);
    useWindowStore.setState({ wide: true });
    useWindowStore.getState().open("meds");
    useWindowStore.getState().open("metrics");
    render(<BottomBar />);
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(useWindowStore.getState().wins.every((w) => w.min)).toBe(true);
  });

  it("counts the open windows and opens the switcher", () => {
    mockUseAuthGate.mockReturnValue(false);
    useWindowStore.getState().open("meds");
    useWindowStore.getState().open("profile");
    render(<BottomBar />);
    const windows = screen.getByRole("button", { name: "Windows, 2 open" });
    expect(windows).toBeEnabled();
    expect(windows).toHaveTextContent("2");
    expect(windows).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(windows);
    expect(windows).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Windows switcher" })).toBeInTheDocument();
  });
});
