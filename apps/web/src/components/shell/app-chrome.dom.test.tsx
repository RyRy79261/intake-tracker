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
vi.mock("@/components/home-page-body", () => ({ HomePageBody: () => <div data-testid="home-body" /> }));
vi.mock("@/hooks/use-window-history", () => ({ useWindowHistory: () => {}, SETTINGS_PATH: "/settings" }));
vi.mock("@/components/settings/settings-sheet", () => ({ SettingsSheet: () => <div data-testid="settings-sheet" /> }));

import { AppChrome } from "@/components/shell/app-chrome";

describe("AppChrome", () => {
  beforeEach(() => {
    pathname = "/";
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
