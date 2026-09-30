// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";

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
import { useWindowStore, type Win } from "@/stores/window-store";

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

  // /auth/native-start starts Google sign-in from a mount effect and
  // /native-auth/bridge mints a one-time code: a remount when the shell
  // parts arrive after hydration would run them twice.
  it("keeps a non-shell page mounted when the shell parts arrive after hydration", async () => {
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    let mounts = 0;
    function Page() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <input aria-label="Email" />;
    }
    pathname = "/auth";
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(
      <AppChrome>
        <Page />
      </AppChrome>,
    );
    const input = container.querySelector("input")!;
    input.value = "typed before hydration";

    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(
        container,
        <AppChrome>
          <Page />
        </AppChrome>,
      );
    });

    // The shell has switched in around the page...
    expect(container.querySelector("[data-shell=ward]")).not.toBeNull();
    expect(container.querySelector("[data-testid=window-layer]")).not.toBeNull();
    // ...and the page is the same instance, with the same DOM.
    expect(mounts).toBe(1);
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("typed before hydration");

    act(() => root.unmount());
    container.remove();
  });

  describe("desktop mode (1024px or more with a mouse)", () => {
    const win = (id: string, extra: Partial<Win> = {}): Win => ({
      id,
      app: "meds",
      st: {},
      z: 1,
      min: false,
      max: false,
      x: 16,
      y: 12,
      w: 720,
      h: 520,
      ...extra,
    });

    beforeEach(() => {
      vi.stubGlobal(
        "matchMedia",
        (query: string) =>
          ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
      );
      useWindowStore.setState({ wins: [], focus: null, showHome: true });
    });
    afterEach(() => {
      cleanup();
      vi.unstubAllGlobals();
      useWindowStore.setState({ wins: [], focus: null, showHome: true });
    });

    it("has no bottom bar, and tells the stylesheet so", () => {
      const { unmount } = render(<AppChrome>page</AppChrome>);
      expect(screen.getByTestId("sys-bar")).toBeInTheDocument();
      expect(screen.queryByTestId("bottom-bar")).not.toBeInTheDocument();
      expect(document.documentElement.dataset.shellMode).toBe("desktop");
      // Home takes the whole width instead of the phone column.
      expect(screen.getByTestId("home")).not.toHaveClass("max-w-lg");
      unmount();
      expect(document.documentElement.dataset.shellMode).toBeUndefined();
    });

    it("keeps Home in use behind free windows", () => {
      useWindowStore.setState({ wins: [win("w1"), win("w2", { app: "metrics", z: 2 })], focus: "w2", showHome: false });
      render(<AppChrome>page</AppChrome>);
      expect(screen.getByTestId("home")).not.toHaveAttribute("inert");
      expect(screen.getByTestId("home")).not.toHaveClass("invisible");
    });

    it("takes Home out of reach under a maximised window or a snapped pair", () => {
      useWindowStore.setState({ wins: [win("w1", { max: true })], focus: "w1", showHome: false });
      render(<AppChrome>page</AppChrome>);
      expect(screen.getByTestId("home")).toHaveAttribute("inert");
      expect(screen.getByTestId("home")).toHaveClass("invisible");

      // One snapped window leaves the other half of Home showing.
      act(() => useWindowStore.setState({ wins: [win("w1", { snap: "l" })] }));
      expect(screen.getByTestId("home")).not.toHaveAttribute("inert");
      act(() =>
        useWindowStore.setState({ wins: [win("w1", { snap: "l" }), win("w2", { app: "metrics", snap: "r" })] }),
      );
      expect(screen.getByTestId("home")).toHaveAttribute("inert");
      // A minimised window covers nothing.
      act(() =>
        useWindowStore.setState({
          wins: [win("w1", { snap: "l" }), win("w2", { app: "metrics", snap: "r", min: true })],
        }),
      );
      expect(screen.getByTestId("home")).not.toHaveAttribute("inert");
    });
  });
});
