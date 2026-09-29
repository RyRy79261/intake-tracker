// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const push = vi.fn();
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

type AuthState =
  | { ready: false; authenticated: false; user: null }
  | { ready: true; authenticated: false; user: null }
  | { ready: true; authenticated: true; user: { id: string; email: string; name: string } };
let auth: AuthState = { ready: true, authenticated: false, user: null };
vi.mock("@/components/auth-guard", () => ({
  useAuth: () => auth,
}));

let slots: Array<{ status: string }> | undefined = [];
vi.mock("@/hooks/use-medication-queries", () => ({
  useDailyDoseSchedule: () => slots,
}));

import { SysBar, initialsFor } from "@/components/shell/sys-bar";
import { useWindowStore } from "@/stores/window-store";
import { useSettingsSheetStore } from "@/stores/settings-sheet-store";

describe("SysBar", () => {
  beforeEach(() => {
    push.mockReset();
    useSettingsSheetStore.setState({ open: false, page: "main" });
    pathname = "/";
    useWindowStore.setState({ wins: [], focus: null, showHome: true, wide: false, z: 0, nextId: 1 });
    window.history.replaceState(null, "", "/");
    auth = { ready: true, authenticated: false, user: null };
    slots = [];
  });

  it("shows the title and the app buttons", () => {
    render(<SysBar />);
    expect(screen.getByRole("heading", { name: "Intake Tracker" })).toBeInTheDocument();
    for (const name of ["Medications", "Metrics", "History", "Settings"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("counts only today's open doses on the Medications pip", () => {
    slots = [
      { status: "pending" },
      { status: "taken" },
      { status: "pending" },
      { status: "skipped" },
    ];
    render(<SysBar />);
    const meds = screen.getByRole("button", { name: "Medications, 2 open" });
    expect(meds).toHaveTextContent("2");
    expect(screen.getByTestId("dose-pip")).toHaveTextContent("2");
  });

  it("hides the pip when nothing is open (and while the schedule loads)", () => {
    slots = [{ status: "taken" }];
    const { rerender } = render(<SysBar />);
    expect(screen.queryByTestId("dose-pip")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Medications" })).toBeInTheDocument();

    slots = undefined;
    rerender(<SysBar />);
    expect(screen.queryByTestId("dose-pip")).not.toBeInTheDocument();
  });

  it("offers sign-in when signed out", () => {
    render(<SysBar />);
    const signIn = screen.getByRole("button", { name: "Sign in for AI features" });
    fireEvent.click(signIn);
    expect(push).toHaveBeenCalledWith("/auth");
    expect(screen.queryByText(/^[A-Z]{1,2}$/)).not.toBeInTheDocument();
  });

  it("shows the avatar initials when signed in and opens Profile", () => {
    auth = {
      ready: true,
      authenticated: true,
      user: { id: "u1", email: "ryan@example.com", name: "Ryan Noble" },
    };
    render(<SysBar />);
    const avatar = screen.getByRole("button", { name: /Profile: Ryan Noble, signed in/ });
    expect(avatar).toHaveTextContent("RN");
    fireEvent.click(avatar);
    // Profile opens as a window over Home; the address bar follows it.
    expect(push).not.toHaveBeenCalled();
    expect(useWindowStore.getState().wins.map((w) => w.app)).toEqual(["profile"]);
    expect(window.location.pathname).toBe("/profile");
  });

  it("disables the account button while auth is loading", () => {
    auth = { ready: false, authenticated: false, user: null };
    render(<SysBar />);
    expect(screen.getByRole("button", { name: "Loading account" })).toBeDisabled();
  });

  it("opens each app as a window and marks the one on screen", () => {
    render(<SysBar />);
    const meds = screen.getByRole("button", { name: "Medications" });
    const metrics = screen.getByRole("button", { name: "Metrics" });
    const history = screen.getByRole("button", { name: "History" });

    fireEvent.click(meds);
    expect(useWindowStore.getState().wins.map((w) => w.app)).toEqual(["meds"]);
    expect(window.location.pathname).toBe("/medications");
    expect(meds).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(metrics);
    expect(metrics).toHaveAttribute("aria-pressed", "true");
    expect(meds).toHaveAttribute("aria-pressed", "false");

    // History is Metrics on Records: the same window, not a new one.
    fireEvent.click(history);
    expect(useWindowStore.getState().wins.map((w) => w.app)).toEqual(["meds", "metrics"]);
    expect(history).toHaveAttribute("aria-pressed", "true");
    expect(metrics).toHaveAttribute("aria-pressed", "false");

    expect(push).not.toHaveBeenCalled();
  });

  it("opens the Settings sheet from the gear, over the windows", () => {
    render(<SysBar />);
    fireEvent.click(screen.getByRole("button", { name: "Medications" }));
    const gear = screen.getByRole("button", { name: "Settings" });
    expect(gear).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(gear);
    // A sheet, not a route change: no navigation, the windows stay open,
    // and the address bar shows the /settings deep link.
    expect(push).not.toHaveBeenCalled();
    expect(useSettingsSheetStore.getState().open).toBe(true);
    expect(window.location.pathname).toBe("/settings");
    expect(gear).toHaveAttribute("aria-expanded", "true");
    expect(useWindowStore.getState().wins.map((w) => w.app)).toEqual(["meds"]);
    // Nothing is "on" while Settings covers the windows.
    expect(screen.getByRole("button", { name: "Medications" })).toHaveAttribute("aria-pressed", "false");
  });

  it("returns to an open window from another route", () => {
    useWindowStore.getState().open("meds");
    pathname = "/auth";
    render(<SysBar />);
    const meds = screen.getByRole("button", { name: "Medications" });
    // Not "on" while another page covers the windows.
    expect(meds).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(meds);
    expect(push).toHaveBeenCalledWith("/medications");
  });
});

describe("initialsFor", () => {
  it("uses first and last name initials", () => {
    expect(initialsFor("Ryan James Noble", "r@x.com")).toBe("RN");
    expect(initialsFor("ryan", "r@x.com")).toBe("R");
  });

  it("falls back to the email when the name is the email or missing", () => {
    expect(initialsFor("sam@x.com", "sam@x.com")).toBe("S");
    expect(initialsFor(null, "kim@x.com")).toBe("K");
    expect(initialsFor(null, null)).toBe("U");
  });
});
