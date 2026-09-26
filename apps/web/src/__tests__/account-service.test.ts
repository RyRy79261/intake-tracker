/**
 * `switchToLocalAndWipeCloud` must never wipe the cloud copy unless a full
 * pull completed in the same call (audit sync-engine#9), and switching to
 * local is an explicit mode choice auto-detect must respect (sync-engine#16).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const engine = vi.hoisted(() => ({
  runPullCycle: vi.fn<() => Promise<boolean>>(),
  stopEngine: vi.fn(),
  startEngine: vi.fn(),
  waitForSyncIdle: vi.fn<() => Promise<void>>(),
}));
const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sync-engine", () => engine);
vi.mock("@/lib/api-fetch", () => ({ apiFetch }));
vi.mock("@/lib/auth-client", () => ({ authClient: { deleteUser: vi.fn() } }));
vi.mock("@/lib/sign-out", () => ({ handleSignOut: vi.fn() }));

import { switchToLocalAndWipeCloud } from "@/lib/account-service";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";

describe("switchToLocalAndWipeCloud", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    engine.waitForSyncIdle.mockResolvedValue(undefined);
    apiFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    useSettingsStore.getState().setStorageMode("cloud-sync");
    useSyncStatusStore.setState({ modeChosenByUser: false });
  });

  it("does not wipe the cloud when the pull did not complete", async () => {
    engine.runPullCycle.mockResolvedValue(false);

    await expect(switchToLocalAndWipeCloud()).rejects.toThrow();

    expect(apiFetch).not.toHaveBeenCalledWith("/api/sync/wipe", expect.anything());
    expect(engine.startEngine).toHaveBeenCalled();
    expect(useSettingsStore.getState().storageMode).toBe("cloud-sync");
  });

  it("waits for in-flight sync to settle before pulling, then wipes", async () => {
    const order: string[] = [];
    engine.stopEngine.mockImplementation(() => order.push("stop"));
    engine.waitForSyncIdle.mockImplementation(async () => {
      order.push("idle");
    });
    engine.runPullCycle.mockImplementation(async () => {
      order.push("pull");
      return true;
    });
    apiFetch.mockImplementation(async () => {
      order.push("wipe");
      return new Response("{}", { status: 200 });
    });

    await switchToLocalAndWipeCloud();

    expect(order).toEqual(["stop", "idle", "pull", "wipe"]);
    expect(useSettingsStore.getState().storageMode).toBe("local");
    expect(useSyncStatusStore.getState().modeChosenByUser).toBe(true);
  });
});
