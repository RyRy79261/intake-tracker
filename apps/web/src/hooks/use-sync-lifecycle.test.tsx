// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const startEngine = vi.fn();
const stopEngine = vi.fn();
const detachLifecycleListeners = vi.fn();
vi.mock("@/lib/sync-engine", () => ({
  startEngine: () => startEngine(),
  stopEngine: () => stopEngine(),
  detachLifecycleListeners: () => detachLifecycleListeners(),
}));

import { db } from "@/lib/db";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";
import { useSyncLifecycle } from "@/hooks/use-sync-lifecycle";
import { SYNC_ACCOUNT_MISMATCH_ERROR } from "@/lib/sync-account";

beforeEach(() => {
  startEngine.mockReset();
  stopEngine.mockReset();
  localStorage.clear();
  useSettingsStore.setState({ storageMode: "cloud-sync" });
  useSyncStatusStore.setState({ lastError: null });
});

describe("useSyncLifecycle account binding (audit sync-engine#11)", () => {
  it("starts the engine for the account this device is bound to", async () => {
    renderHook(() => useSyncLifecycle(true, "user-a"));
    await waitFor(() => expect(startEngine).toHaveBeenCalledTimes(1));
  });

  it("does not start the engine for a different account while another's ops are pending", async () => {
    localStorage.setItem("intake-sync-account", "user-a");
    await db._syncQueue.add({
      tableName: "intakeRecords",
      recordId: "rec-1",
      op: "upsert",
      enqueuedAt: Date.now(),
      attempts: 0,
    } as never);

    renderHook(() => useSyncLifecycle(true, "user-b"));

    await waitFor(() =>
      expect(useSyncStatusStore.getState().lastError).toBe(
        SYNC_ACCOUNT_MISMATCH_ERROR,
      ),
    );
    expect(startEngine).not.toHaveBeenCalled();
  });

  it("does not start the engine when signed out", async () => {
    renderHook(() => useSyncLifecycle(false, null));
    await new Promise((r) => setTimeout(r, 20));
    expect(startEngine).not.toHaveBeenCalled();
  });
});
