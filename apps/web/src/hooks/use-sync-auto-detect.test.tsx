// @vitest-environment jsdom
/**
 * Auto-detect must never override a mode the user chose on this device, and
 * it uploads the device's existing records when it does switch to cloud-sync
 * (audit sync-engine#16).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const apiFetch = vi.hoisted(() => vi.fn());
const queueLocalDataForSync = vi.hoisted(() => vi.fn(async () => 0));
vi.mock("@/lib/api-fetch", () => ({ apiFetch }));
vi.mock("@/lib/migration-service", () => ({ queueLocalDataForSync }));

import { useSyncAutoDetect } from "@/hooks/use-sync-auto-detect";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";

describe("useSyncAutoDetect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ hasSyncedData: true }), { status: 200 }),
    );
    useSettingsStore.getState().setStorageMode("local");
    useSyncStatusStore.setState({ modeChosenByUser: false });
  });

  it("restores cloud-sync on a default local device, queueing its local data first", async () => {
    renderHook(() => useSyncAutoDetect(true));

    await waitFor(() =>
      expect(useSettingsStore.getState().storageMode).toBe("cloud-sync"),
    );
    expect(queueLocalDataForSync).toHaveBeenCalledTimes(1);
  });

  it("leaves an explicitly chosen local mode alone", async () => {
    useSyncStatusStore.setState({ modeChosenByUser: true });

    renderHook(() => useSyncAutoDetect(true));
    await new Promise((r) => setTimeout(r, 20));

    expect(apiFetch).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().storageMode).toBe("local");
    expect(queueLocalDataForSync).not.toHaveBeenCalled();
  });
});
