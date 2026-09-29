// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";

let pathname = "/";
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => search,
}));

import {
  __resetWindowHistoryForTests,
  closeWindow,
  goHome,
  openWindow,
  useWindowHistory,
} from "@/hooks/use-window-history";
import { useWindowStore } from "@/stores/window-store";

function Sync() {
  useWindowHistory();
  return null;
}

const apps = () => useWindowStore.getState().wins.map((w) => w.app);

/** jsdom fires popstate asynchronously after history.back(). */
async function back() {
  const popped = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
  window.history.back();
  await popped;
}

describe("useWindowHistory", () => {
  beforeEach(() => {
    __resetWindowHistoryForTests();
    useWindowStore.setState({ wins: [], focus: null, showHome: true, wide: false, z: 0, nextId: 1 });
    window.history.replaceState(null, "", "/");
    pathname = "/";
    search = new URLSearchParams();
  });
  afterEach(cleanup);

  it("Back closes the window on top, one per press", async () => {
    render(<Sync />);
    openWindow("meds");
    openWindow("metrics");
    expect(window.location.pathname).toBe("/analytics");

    await back();
    expect(apps()).toEqual(["meds"]);
    expect(useWindowStore.getState().focus).toBe(useWindowStore.getState().wins[0]?.id);
    expect(window.location.pathname).toBe("/medications");

    await back();
    expect(apps()).toEqual([]);
    expect(useWindowStore.getState().showHome).toBe(true);
    expect(window.location.pathname).toBe("/");
  });

  it("focusing an open app does not push another entry", () => {
    render(<Sync />);
    openWindow("meds");
    const len = window.history.length;
    openWindow("meds");
    expect(window.history.length).toBe(len);
  });

  it("closing from the title bar steps back over the window's entry", async () => {
    render(<Sync />);
    const res = openWindow("meds");
    const popped = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
    closeWindow(res!.win.id);
    await popped;
    expect(apps()).toEqual([]);
    expect(window.location.pathname).toBe("/");
  });

  it("the phone Home button closes the window on screen", async () => {
    render(<Sync />);
    openWindow("meds");
    const popped = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
    goHome();
    await popped;
    expect(apps()).toEqual([]);
    expect(useWindowStore.getState().showHome).toBe(true);
  });

  it("a deep link opens its window over a Home entry", async () => {
    window.history.replaceState(null, "", "/analytics?tab=records");
    pathname = "/analytics";
    search = new URLSearchParams("tab=records");
    render(<Sync />);
    await waitFor(() => expect(apps()).toEqual(["metrics"]));
    expect(useWindowStore.getState().wins[0]?.st.tab).toBe("records");
    expect(window.location.pathname + window.location.search).toBe("/analytics?tab=records");

    // Back closes it instead of leaving the app.
    await back();
    expect(apps()).toEqual([]);
    expect(window.location.pathname).toBe("/");
  });

  it("Back from Settings returns to the window that was open", async () => {
    const { rerender } = render(<Sync />);
    openWindow("meds");
    // router.push("/settings"): a new untagged entry the route sync tags.
    window.history.pushState(null, "", "/settings");
    pathname = "/settings";
    rerender(<Sync />);
    await waitFor(() => expect(window.history.state?.wardOff).toBe(true));

    await back();
    expect(apps()).toEqual(["meds"]);
    const s = useWindowStore.getState();
    expect(s.showHome).toBe(false);
    expect(s.focus).toBe(s.wins[0]?.id);
    expect(window.location.pathname).toBe("/medications");
  });

  it("Back closes the window whose entry it leaves, not the focused one", async () => {
    render(<Sync />);
    const meds = openWindow("meds");
    openWindow("metrics");
    useWindowStore.getState().switchTo(meds!.win.id); // the switcher pushes no entry

    await back();
    expect(apps()).toEqual(["meds"]);
    expect(useWindowStore.getState().focus).toBe(meds!.win.id);
    expect(window.location.pathname).toBe("/medications");
  });

  it("/history opens Metrics on Records", async () => {
    window.history.replaceState(null, "", "/history");
    pathname = "/history";
    render(<Sync />);
    await waitFor(() => expect(apps()).toEqual(["metrics"]));
    expect(useWindowStore.getState().wins[0]?.st.tab).toBe("records");
  });
});
