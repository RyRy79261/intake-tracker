// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useNotificationSettings } from "@/hooks/use-notification-queries";

const SETTINGS_KEY = "intake-tracker-notifications";

describe("useNotificationSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getSettings returns defaults when nothing is stored", () => {
    const { result } = renderHook(() => useNotificationSettings());
    const settings = result.current.getSettings();
    expect(settings).toEqual({
      enabled: false,
      lastCheck: null,
      checkIntervalHours: 24,
    });
  });

  it("saveSettings persists a partial update to localStorage and merges with defaults", () => {
    const { result } = renderHook(() => useNotificationSettings());

    result.current.saveSettings({ enabled: true, checkIntervalHours: 12 });

    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)!);
    expect(stored).toEqual({
      enabled: true,
      lastCheck: null,
      checkIntervalHours: 12,
    });

    // A subsequent read reflects the persisted value.
    expect(result.current.getSettings().enabled).toBe(true);
    expect(result.current.getSettings().checkIntervalHours).toBe(12);
  });

  it("saveSettings preserves previously saved fields on a later partial write", () => {
    const { result } = renderHook(() => useNotificationSettings());

    result.current.saveSettings({ enabled: true });
    result.current.saveSettings({ lastCheck: 1700000000000 });

    const settings = result.current.getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.lastCheck).toBe(1700000000000);
  });

  it("sendTest returns false when notification permission is not granted", async () => {
    const { result } = renderHook(() => useNotificationSettings());
    // jsdom has no Notification API → isNotificationSupported() is false.
    await expect(result.current.sendTest()).resolves.toBe(false);
  });
});
