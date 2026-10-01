// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { currentSwipePage, neighbourPage, swipePages, SWIPE_PAGES } from "@/components/shell/phone-swipe";
import { useWindowStore } from "@/stores/window-store";

describe("phone swipe pages", () => {
  beforeEach(() => {
    useWindowStore.setState({ wins: [], focus: null, showHome: true, wide: false, z: 0, nextId: 1 });
  });

  it("runs in the sys-bar's order: Home, Medications, Metrics, History, Profile", () => {
    expect(SWIPE_PAGES).toEqual(["home", "meds", "metrics", "history", "profile"]);
    expect(neighbourPage("home", 1)).toBe("meds");
    expect(neighbourPage("home", -1)).toBeNull();
    expect(neighbourPage("meds", 1)).toBe("metrics");
    expect(neighbourPage("metrics", 1)).toBe("history");
    expect(neighbourPage("history", 1)).toBe("profile");
    expect(neighbourPage("profile", 1)).toBeNull();
    expect(neighbourPage("profile", -1)).toBe("history");
  });

  it("leaves Profile out when signed out", () => {
    const pages = swipePages(false);
    expect(pages).toEqual(["home", "meds", "metrics", "history"]);
    expect(neighbourPage("history", 1, pages)).toBeNull();
    expect(swipePages(true)).toEqual(SWIPE_PAGES);
  });

  it("reads the page on screen from the windows", () => {
    expect(currentSwipePage()).toBe("home");
    useWindowStore.getState().open("meds");
    expect(currentSwipePage()).toBe("meds");
    useWindowStore.getState().open("metrics", { tab: "summary" });
    expect(currentSwipePage()).toBe("metrics");
    // History is Metrics on Records.
    useWindowStore.getState().open("history");
    expect(currentSwipePage()).toBe("history");
    // The manual is not one of the pages: no swipe from it.
    useWindowStore.getState().open("help");
    expect(currentSwipePage()).toBeNull();
  });
});
