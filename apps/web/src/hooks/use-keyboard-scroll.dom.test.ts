// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";

import { scrollBehavior } from "@/hooks/use-keyboard-scroll";

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion: reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("scrollBehavior", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove("reduce-motion");
  });

  it("scrolls smoothly by default", () => {
    mockReducedMotion(false);
    expect(scrollBehavior()).toBe("smooth");
  });

  it("jumps when the OS asks for reduced motion", () => {
    mockReducedMotion(true);
    expect(scrollBehavior()).toBe("auto");
  });

  it("jumps when Settings > Reduce motion is on", () => {
    mockReducedMotion(false);
    document.documentElement.classList.add("reduce-motion");
    expect(scrollBehavior()).toBe("auto");
  });
});
