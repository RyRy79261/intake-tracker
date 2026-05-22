// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WelcomeDialog } from "@/components/welcome-dialog";
import { WELCOME_SEEN_KEY } from "@/lib/constants";

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(() => "/"),
}));

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}));

function setPointer(coarse: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: coarse,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("WelcomeDialog", () => {
  beforeEach(() => {
    localStorage.clear();
    mockUsePathname.mockReturnValue("/");
    setPointer(false);
  });

  it("greets first-time visitors when the seen flag is absent", () => {
    render(<WelcomeDialog />);
    expect(screen.getByText("Welcome to Intake Tracker")).toBeInTheDocument();
  });

  it("stays hidden once the seen flag is set", () => {
    localStorage.setItem(WELCOME_SEEN_KEY, "true");
    render(<WelcomeDialog />);
    expect(
      screen.queryByText("Welcome to Intake Tracker")
    ).not.toBeInTheDocument();
  });

  it("does not render on the auth pages", () => {
    mockUsePathname.mockReturnValue("/auth");
    render(<WelcomeDialog />);
    expect(
      screen.queryByText("Welcome to Intake Tracker")
    ).not.toBeInTheDocument();
  });

  it("persists the seen flag and closes when dismissed", async () => {
    const user = userEvent.setup();
    render(<WelcomeDialog />);

    await user.click(screen.getByRole("button", { name: /got it/i }));

    expect(localStorage.getItem(WELCOME_SEEN_KEY)).toBe("true");
    await waitFor(() =>
      expect(
        screen.queryByText("Welcome to Intake Tracker")
      ).not.toBeInTheDocument()
    );
  });

  it("tells touch users to shake the phone", () => {
    setPointer(true);
    render(<WelcomeDialog />);
    expect(screen.getByText(/shake your phone/i)).toBeInTheDocument();
  });

  it("points desktop users to the Help section in Settings", () => {
    setPointer(false);
    render(<WelcomeDialog />);
    expect(
      screen.getByText(/Help section in Settings/i)
    ).toBeInTheDocument();
  });
});
