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

import { BottomBar } from "@/components/shell/bottom-bar";

describe("BottomBar", () => {
  beforeEach(() => {
    push.mockReset();
    pathname = "/";
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

    pathname = "/medications";
    render(<BottomBar />);
    const home = screen.getByRole("button", { name: "Home" });
    expect(home).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(home);
    expect(push).toHaveBeenCalledWith("/");
  });

  it("keeps the Windows slot as a disabled placeholder with a count", () => {
    mockUseAuthGate.mockReturnValue(false);
    render(<BottomBar />);
    const windows = screen.getByRole("button", { name: "Windows, 0 open" });
    expect(windows).toBeDisabled();
    expect(windows).toHaveTextContent("0");
  });
});
