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
  closeSettings,
  closeSettingsPage,
  closeWindow,
  goHome,
  openSettings,
  openSettingsPage,
  openWindow,
  useWindowHistory,
} from "@/hooks/use-window-history";
import { useWindowStore } from "@/stores/window-store";
import { useSettingsSheetStore } from "@/stores/settings-sheet-store";

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
    useSettingsSheetStore.setState({ open: false, page: "main", groups: { tracking: true } });
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

  it("a /help/<slug> deep link opens the manual window on that guide", async () => {
    window.history.replaceState(null, "", "/help/weight");
    pathname = "/help/weight";
    render(<Sync />);
    await waitFor(() => expect(apps()).toEqual(["help"]));
    expect(useWindowStore.getState().wins[0]?.st.slug).toBe("weight");
    expect(window.location.pathname).toBe("/help/weight");

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

  it("Forward onto a closed window's entry reopens the window", async () => {
    render(<Sync />);
    openWindow("metrics", { tab: "records" });
    const seq = window.history.state?.wardSeq;
    await back();
    expect(apps()).toEqual([]);
    expect(window.location.pathname).toBe("/");

    const popped = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
    window.history.forward();
    await popped;
    expect(window.location.pathname + window.location.search).toBe("/analytics?tab=records");
    expect(apps()).toEqual(["metrics"]);
    const s = useWindowStore.getState();
    expect(s.wins[0]?.st.tab).toBe("records");
    expect(s.showHome).toBe(false);
    // The entry now belongs to the new window, in the same place in history.
    expect(window.history.state?.wardWin).toBe(s.wins[0]?.id);
    expect(window.history.state?.wardSeq).toBe(seq);

    // Back closes it again, without leaving the app.
    await back();
    expect(apps()).toEqual([]);
    expect(window.location.pathname).toBe("/");
  });

  it("Forward past a reopened window onto a page leaves the windows alone", async () => {
    const { rerender } = render(<Sync />);
    const meds = openWindow("meds");
    window.history.pushState(null, "", "/privacy");
    pathname = "/privacy";
    rerender(<Sync />);
    await waitFor(() => expect(window.history.state?.wardOff).toBe(true));
    await back();
    await back();
    expect(apps()).toEqual([]);

    const popped = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
    window.history.forward();
    await popped;
    expect(apps()).toEqual(["meds"]);
    expect(useWindowStore.getState().wins[0]?.id).not.toBe(meds!.win.id);
    const wins = useWindowStore.getState().wins;

    // Forward again, onto /privacy: not a window's entry, nothing to reopen.
    const again = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
    window.history.forward();
    await again;
    expect(useWindowStore.getState().wins).toBe(wins);
  });

  it("a reload on a window's entry whose window is gone reopens the window", async () => {
    // What a reload restores: the entry's state, but no window in sessionStorage.
    window.history.replaceState({ wardSeq: 5, wardWin: "w3" }, "", "/medications");
    pathname = "/medications";
    const len = window.history.length;
    render(<Sync />);
    await waitFor(() => expect(apps()).toEqual(["meds"]));
    expect(window.history.state?.wardWin).toBe(useWindowStore.getState().wins[0]?.id);
    expect(window.history.state?.wardSeq).toBe(5);
    expect(window.history.length).toBe(len);
    expect(window.location.pathname).toBe("/medications");
  });

  it("a reload on a window's entry keeps the window restored from sessionStorage", async () => {
    const win = { id: "w3", app: "meds" as const, st: {}, z: 1, min: false, max: false, x: 16, y: 12, w: 720, h: 520 };
    useWindowStore.setState({ wins: [win], focus: "w3", showHome: false, z: 1, nextId: 4 });
    window.history.replaceState({ wardSeq: 5, wardWin: "w3" }, "", "/medications");
    pathname = "/medications";
    render(<Sync />);
    await Promise.resolve();
    expect(useWindowStore.getState().wins).toEqual([win]);
    expect(window.history.state?.wardWin).toBe("w3");
  });

  it("/history opens Metrics on Records", async () => {
    window.history.replaceState(null, "", "/history");
    pathname = "/history";
    render(<Sync />);
    await waitFor(() => expect(apps()).toEqual(["metrics"]));
    expect(useWindowStore.getState().wins[0]?.st.tab).toBe("records");
  });

  describe("Settings sheet", () => {
    const sheetOpen = () => useSettingsSheetStore.getState().open;

    it("Back closes the sheet before the window under it", async () => {
      render(<Sync />);
      openWindow("meds");
      openSettings();
      expect(sheetOpen()).toBe(true);
      expect(window.location.pathname).toBe("/settings");

      await back();
      expect(sheetOpen()).toBe(false);
      expect(apps()).toEqual(["meds"]);
      expect(window.location.pathname).toBe("/medications");
    });

    it("Back closes the sheet, then Back again closes the window under it", async () => {
      render(<Sync />);
      openWindow("metrics");
      openSettings();
      expect(window.location.pathname).toBe("/settings");

      await back();
      expect(sheetOpen()).toBe(false);
      expect(apps()).toEqual(["metrics"]);
      expect(useWindowStore.getState().showHome).toBe(false);
      expect(window.location.pathname).toBe("/analytics");

      await back();
      expect(sheetOpen()).toBe(false);
      expect(apps()).toEqual([]);
      expect(window.location.pathname).toBe("/");
    });

    it("closing the sheet steps back over its entry", async () => {
      render(<Sync />);
      openSettings("data");
      expect(useSettingsSheetStore.getState().groups.data).toBe(true);
      const popped = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
      closeSettings();
      await popped;
      expect(sheetOpen()).toBe(false);
      expect(window.location.pathname).toBe("/");
    });

    it("a second open does not push another entry", () => {
      render(<Sync />);
      openSettings();
      const len = window.history.length;
      openSettings("meds");
      expect(window.history.length).toBe(len);
      expect(useSettingsSheetStore.getState().groups.meds).toBe(true);
    });

    it("the /settings deep link opens the sheet over a Home entry", async () => {
      window.history.replaceState(null, "", "/settings?section=about");
      pathname = "/settings";
      search = new URLSearchParams("section=about");
      render(<Sync />);
      await waitFor(() => expect(sheetOpen()).toBe(true));
      expect(useSettingsSheetStore.getState().groups.about).toBe(true);
      expect(window.location.pathname).toBe("/settings");

      await back();
      expect(sheetOpen()).toBe(false);
      expect(window.location.pathname).toBe("/");
    });

    it("leaving /settings for another route closes the sheet", async () => {
      window.history.replaceState(null, "", "/settings");
      pathname = "/settings";
      const { rerender } = render(<Sync />);
      await waitFor(() => expect(sheetOpen()).toBe(true));
      pathname = "/help";
      rerender(<Sync />);
      await waitFor(() => expect(sheetOpen()).toBe(false));
    });

    describe("Drink presets sub-page", () => {
      const page = () => useSettingsSheetStore.getState().page;

      it("Back returns to the settings groups, then Back again closes the sheet", async () => {
        render(<Sync />);
        openSettings();
        openSettingsPage("presets");
        expect(page()).toBe("presets");
        expect(window.location.pathname).toBe("/settings");

        await back();
        expect(sheetOpen()).toBe(true);
        expect(page()).toBe("main");
        expect(window.location.pathname).toBe("/settings");

        await back();
        expect(sheetOpen()).toBe(false);
        expect(window.location.pathname).toBe("/");
      });

      it("the on-screen Back button steps back over the sub-page's entry", async () => {
        render(<Sync />);
        openSettings();
        openSettingsPage("presets");
        const popped = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
        closeSettingsPage();
        await popped;
        expect(sheetOpen()).toBe(true);
        expect(page()).toBe("main");

        // One Back now closes the sheet: no dead sub-page entry is left.
        await back();
        expect(sheetOpen()).toBe(false);
        expect(window.location.pathname).toBe("/");
      });

      it("closing the sheet from the sub-page steps back over both entries", async () => {
        render(<Sync />);
        openWindow("meds");
        openSettings();
        openSettingsPage("presets");
        const popped = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
        closeSettings();
        await popped;
        expect(sheetOpen()).toBe(false);
        expect(apps()).toEqual(["meds"]);
        expect(window.location.pathname).toBe("/medications");
      });
    });
  });
});
