// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const push = vi.fn();
let pathname = "/";
let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(search),
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

describe("SysBar", () => {
  beforeEach(() => {
    push.mockReset();
    pathname = "/";
    search = "";
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
    expect(push).toHaveBeenCalledWith("/profile");
  });

  it("disables the account button while auth is loading", () => {
    auth = { ready: false, authenticated: false, user: null };
    render(<SysBar />);
    expect(screen.getByRole("button", { name: "Loading account" })).toBeDisabled();
  });

  it("navigates each app button to its route and marks the current one", () => {
    pathname = "/analytics";
    render(<SysBar />);
    expect(screen.getByRole("button", { name: "Metrics" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "History" })).not.toHaveAttribute("aria-current");

    fireEvent.click(screen.getByRole("button", { name: "Medications" }));
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    // Already on /analytics: no push for Metrics.
    fireEvent.click(screen.getByRole("button", { name: "Metrics" }));
    // History opens the Records tab directly, not the /history redirect
    // (which sits outside the chrome and would flicker the bars).
    expect(push.mock.calls.map((c) => c[0])).toEqual(["/medications", "/analytics?tab=records", "/settings"]);
  });

  it("lights History, not Metrics, on the Records tab, and Metrics leaves it", () => {
    pathname = "/analytics";
    search = "tab=records";
    render(<SysBar />);
    expect(screen.getByRole("button", { name: "History" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Metrics" })).not.toHaveAttribute("aria-current");

    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: "Metrics" }));
    expect(push.mock.calls.map((c) => c[0])).toEqual(["/analytics"]);
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
