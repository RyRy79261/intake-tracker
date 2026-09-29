// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { getManualPreview, PREVIEW_SLUGS } from "@/components/help/preview-registry";
import { MANUALS, getManual } from "@/lib/help/manuals";
import { isWindowRoute, windowForRoute, windowHref } from "@/lib/nav-routes";

/** The guides the prototype gives a live demo. */
const DEMO_SLUGS = [
  "how-it-works",
  "logging-drinks",
  "food-and-sodium",
  "blood-pressure",
  "weight",
  "urination-and-bowel",
  "editing-entries",
  "adding-medication",
  "medication-schedule",
];

describe("preview registry", () => {
  it.each(DEMO_SLUGS)("resolves a live demo for %s", (slug) => {
    expect(getManual(slug)).toBeDefined();
    const preview = getManualPreview(slug);
    expect(preview).toBeDefined();
    expect(typeof preview?.render).toBe("function");
    expect(typeof preview?.seed).toBe("function");
  });

  it("registers a demo only for guides that exist", () => {
    const slugs = new Set(MANUALS.map((m) => m.slug));
    for (const slug of PREVIEW_SLUGS) expect(slugs.has(slug)).toBe(true);
    expect([...PREVIEW_SLUGS].sort()).toEqual([...DEMO_SLUGS].sort());
  });

  it("has no demo for unknown or inherited keys", () => {
    expect(getManualPreview("voice-operator")).toBeUndefined();
    expect(getManualPreview("toString")).toBeUndefined();
  });
});

describe("manual deep links", () => {
  it("opens the manual window on the index or on a guide", () => {
    expect(isWindowRoute("/help")).toBe(true);
    expect(isWindowRoute("/help/weight")).toBe(true);
    expect(isWindowRoute("/help/weight/extra")).toBe(false);
    expect(windowForRoute("/help", null)).toEqual({ app: "help", st: { slug: null } });
    expect(windowForRoute("/help/weight", null)).toEqual({ app: "help", st: { slug: "weight" } });
  });

  it("round-trips every guide through its href", () => {
    for (const { slug } of MANUALS) {
      const href = windowHref("help", { slug });
      expect(windowForRoute(href, null)).toEqual({ app: "help", st: { slug } });
    }
    expect(windowHref("help", { slug: null })).toBe("/help");
  });
});
