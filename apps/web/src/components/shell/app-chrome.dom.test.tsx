// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/components/app-header", () => ({ AppHeader: () => <div data-testid="legacy-header" /> }));
vi.mock("@/components/swipe-nav", () => ({
  SwipeNav: ({ children }: { children: React.ReactNode }) => <div data-testid="swipe-nav">{children}</div>,
}));
vi.mock("@/components/home-floating-bars", () => ({ HomeFloatingBars: () => <div data-testid="home-floating-bars" /> }));
vi.mock("@/components/medications-floating-bars", () => ({
  MedicationsFloatingBars: ({ aboveBottomBar }: { aboveBottomBar?: boolean }) => (
    <div data-testid="meds-floating-bars" data-above={aboveBottomBar ? "true" : undefined} />
  ),
}));
vi.mock("@/components/shell/sys-bar", () => ({ SysBar: () => <div data-testid="sys-bar" /> }));
vi.mock("@/components/shell/bottom-bar", () => ({ BottomBar: () => <div data-testid="bottom-bar" /> }));

import { AppChrome } from "@/components/shell/app-chrome";
import { useSettingsStore } from "@/stores/settings-store";

describe("AppChrome", () => {
  beforeEach(() => {
    pathname = "/";
  });

  it("renders the legacy frame when the Ward shell is off", () => {
    useSettingsStore.setState({ wardShell: false });
    render(<AppChrome>page</AppChrome>);
    expect(screen.getByTestId("legacy-header")).toBeInTheDocument();
    expect(screen.getByTestId("swipe-nav")).toHaveTextContent("page");
    expect(screen.getByTestId("home-floating-bars")).toBeInTheDocument();
    expect(screen.getByTestId("meds-floating-bars")).toBeInTheDocument();
    expect(screen.queryByTestId("sys-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bottom-bar")).not.toBeInTheDocument();
    expect(document.querySelector("[data-shell=ward]")).toBeNull();
  });

  it("renders the Ward shell on chrome routes when it is on", () => {
    useSettingsStore.setState({ wardShell: true });
    render(<AppChrome>page</AppChrome>);
    expect(screen.getByTestId("sys-bar")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-bar")).toBeInTheDocument();
    expect(screen.getByTestId("meds-floating-bars")).toHaveAttribute("data-above", "true");
    expect(screen.queryByTestId("legacy-header")).not.toBeInTheDocument();
    expect(screen.queryByTestId("swipe-nav")).not.toBeInTheDocument();
    expect(screen.getByText("page")).toBeInTheDocument();
  });

  it("drops the bars off the chrome routes", () => {
    useSettingsStore.setState({ wardShell: true });
    pathname = "/auth";
    render(<AppChrome>page</AppChrome>);
    expect(screen.queryByTestId("sys-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bottom-bar")).not.toBeInTheDocument();
  });
});
