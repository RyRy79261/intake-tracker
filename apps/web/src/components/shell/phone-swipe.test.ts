// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { currentSwipePage, neighbourPage, SWIPE_PAGES } from "@/components/shell/phone-swipe";
import { useWindowStore } from "@/stores/window-store";

describe("phone swipe pages", () => {
  beforeEach(() => {
    useWindowStore.setState({ wins: [], focus: null, showHome: true, wide: false, z: 0, nextId: 1 });
  });

  it("runs Profile, Home, Medications, Metrics", () => {
    expect(SWIPE_PAGES).toEqual(["profile", "home", "meds", "metrics"]);
    expect(neighbourPage("home", 1)).toBe("meds");
    expect(neighbourPage("home", -1)).toBe("profile");
    expect(neighbourPage("meds", 1)).toBe("metrics");
    expect(neighbourPage("metrics", 1)).toBeNull();
    expect(neighbourPage("profile", -1)).toBeNull();
  });

  it("reads the page on screen from the windows", () => {
    expect(currentSwipePage()).toBe("home");
    useWindowStore.getState().open("meds");
    expect(currentSwipePage()).toBe("meds");
    useWindowStore.getState().open("history");
    expect(currentSwipePage()).toBe("metrics");
    // The manual is not one of the pages: no swipe from it.
    useWindowStore.getState().open("help");
    expect(currentSwipePage()).toBeNull();
  });
});
