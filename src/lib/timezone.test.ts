import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDeviceTimezone, clearTimezoneCache } from "./timezone";

describe("clearTimezoneCache", () => {
  let originalDateTimeFormat: typeof Intl.DateTimeFormat;
  const hadWindow = typeof globalThis.window !== "undefined";

  beforeEach(() => {
    originalDateTimeFormat = Intl.DateTimeFormat;
    // Ensure `window` exists so getDeviceTimezone() reads from Intl API
    if (!hadWindow) {
      (globalThis as any).window = {};
    }
    // Always start with a clean cache
    clearTimezoneCache();
  });

  afterEach(() => {
    // Restore original Intl.DateTimeFormat
    Intl.DateTimeFormat = originalDateTimeFormat;
    // Clean up cache
    clearTimezoneCache();
    // Remove the window shim if we added it
    if (!hadWindow) {
      delete (globalThis as any).window;
    }
  });

  it("after clearing cache, getDeviceTimezone() re-reads from Intl API", () => {
    // Mock Intl.DateTimeFormat to return "Africa/Johannesburg"
    Intl.DateTimeFormat = vi.fn(() => ({
      resolvedOptions: () => ({ timeZone: "Africa/Johannesburg" }),
    })) as unknown as typeof Intl.DateTimeFormat;

    const first = getDeviceTimezone();
    expect(first).toBe("Africa/Johannesburg");

    // Now change the mock to return a different timezone
    Intl.DateTimeFormat = vi.fn(() => ({
      resolvedOptions: () => ({ timeZone: "Europe/Berlin" }),
    })) as unknown as typeof Intl.DateTimeFormat;

    // Without clearing cache, should still return cached value
    const cached = getDeviceTimezone();
    expect(cached).toBe("Africa/Johannesburg");

    // Clear the cache
    clearTimezoneCache();

    // Now it should re-read and get "Europe/Berlin"
    const refreshed = getDeviceTimezone();
    expect(refreshed).toBe("Europe/Berlin");
  });

  it("clearTimezoneCache() is callable and does not throw", () => {
    expect(() => clearTimezoneCache()).not.toThrow();
  });

  it("clearTimezoneCache() when cache is already empty is a no-op (does not throw)", () => {
    // Cache is empty from beforeEach
    // Call again — should not throw
    expect(() => clearTimezoneCache()).not.toThrow();
    expect(() => clearTimezoneCache()).not.toThrow();
  });
});
