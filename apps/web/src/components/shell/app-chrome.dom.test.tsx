// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/components/shell/sys-bar", () => ({ SysBar: () => <div data-testid="sys-bar" /> }));
vi.mock("@/components/shell/bottom-bar", () => ({ BottomBar: () => <div data-testid="bottom-bar" /> }));
vi.mock("@/components/shell/window-layer", () => ({
  WindowLayer: () => <div data-testid="window-layer" />,
  useIsWide: () => false,
}));
const home = vi.hoisted(() => ({ crash: false }));
vi.mock("@/components/home-page-body", () => ({
  HomePageBody: () => {
    if (home.crash) throw new Error("bad record");
    return <div data-testid="home-body" />;
  },
}));
vi.mock("@/lib/error-log-service", () => ({ rawConsoleError: () => {}, logError: async () => undefined }));
vi.mock("@/hooks/use-window-history", () => ({ useWindowHistory: () => {}, SETTINGS_PATH: "/settings" }));
vi.mock("@/components/settings/settings-sheet", () => ({ SettingsSheet: () => <div data-testid="settings-sheet" /> }));

import { AppChrome } from "@/components/shell/app-chrome";

describe("AppChrome", () => {
  beforeEach(() => {
    pathname = "/";
    home.crash = false;
  });

  it("renders the Ward shell on chrome routes", () => {
    render(<AppChrome>page</AppChrome>);
    expect(document.querySelector("[data-shell=ward]")).not.toBeNull();
    expect(screen.getByTestId("sys-bar")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-bar")).toBeInTheDocument();
    // Home and the window routes render Home, with the windows over it.
    expect(screen.getByTestId("home-body")).toBeInTheDocument();
    expect(screen.getByTestId("window-layer")).toBeInTheDocument();
  });

  it("renders Home under the Settings sheet on /settings", () => {
    pathname = "/settings";
    render(<AppChrome>page</AppChrome>);
    expect(screen.getByTestId("sys-bar")).toBeInTheDocument();
    expect(screen.getByTestId("home-body")).toBeInTheDocument();
    expect(screen.getByTestId("settings-sheet")).toBeInTheDocument();
    expect(screen.queryByText("page")).not.toBeInTheDocument();
  });

  // The crash screen's "Report this problem" hard-loads /settings, which
  // renders Home: a Home crash must stay inside Home, or it would take down
  // the Settings sheet (and its crash report) again.
  it("keeps the shell and the Settings sheet up when Home crashes", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    home.crash = true;
    pathname = "/settings";
    render(<AppChrome>page</AppChrome>);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByTestId("home")).toContainElement(screen.getByText("Something went wrong"));
    expect(screen.getByTestId("sys-bar")).toBeInTheDocument();
    expect(screen.getByTestId("window-layer")).toBeInTheDocument();
    expect(screen.getByTestId("settings-sheet")).toBeInTheDocument();
    error.mockRestore();
  });

  it("drops the bars off the chrome routes", () => {
    pathname = "/auth";
    render(<AppChrome>page</AppChrome>);
    expect(screen.queryByTestId("sys-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bottom-bar")).not.toBeInTheDocument();
    expect(screen.getByText("page")).toBeInTheDocument();
  });

  it("server-renders a plain frame: non-shell pages keep their content, shell routes wait for the client", async () => {
    const { renderToString } = await import("react-dom/server");
    pathname = "/privacy";
    let html = renderToString(<AppChrome>privacy text</AppChrome>);
    expect(html).toContain("privacy text");
    expect(html).not.toContain("data-shell");
    pathname = "/medications";
    html = renderToString(<AppChrome>page</AppChrome>);
    expect(html).not.toContain("page");
    expect(html).not.toContain("sys-bar");
  });
});
