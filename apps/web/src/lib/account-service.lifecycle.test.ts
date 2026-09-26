import { describe, it, expect, vi, beforeEach } from "vitest";

import { db } from "@/lib/db";
import { enqueue } from "@/lib/sync-queue";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";

/**
 * account-service drives the destructive account flows. These tests pin the
 * ordering guarantees that keep them safe: local data is never touched, the
 * sync engine is stopped before the server is wiped, and a failed server call
 * restarts the engine and leaves the sync link intact.
 */

const engine = vi.hoisted(() => ({
  runPullCycle: vi.fn(async () => true),
  stopEngine: vi.fn(),
  startEngine: vi.fn(),
  waitForSyncIdle: vi.fn(async () => undefined),
}));
const apiFetch = vi.hoisted(() => vi.fn());
const deleteUser = vi.hoisted(() => vi.fn());
const handleSignOut = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/sync-engine", () => engine);
vi.mock("@/lib/api-fetch", () => ({ apiFetch }));
vi.mock("@/lib/auth-client", () => ({ authClient: { deleteUser } }));
vi.mock("@/lib/sign-out", () => ({ handleSignOut }));

import { switchToLocalAndWipeCloud, deleteAccount } from "@/lib/account-service";

const ok = () => new Response("{}", { status: 200 });
const fail = () => new Response("{}", { status: 500 });

async function seedSyncState() {
  await db.intakeRecords.add(makeIntakeRecord({ id: "local-row" }));
  await enqueue("intakeRecords", "local-row", "upsert");
  useSettingsStore.setState({ storageMode: "cloud-sync" });
  useSyncStatusStore.setState({ initialSyncComplete: true, queueDepth: 1 });
}

async function expectSyncLinkIntact() {
  expect(await db._syncQueue.count()).toBe(1);
  expect(useSettingsStore.getState().storageMode).toBe("cloud-sync");
}

async function expectSeveredToLocal() {
  expect(await db._syncQueue.count()).toBe(0);
  expect(useSettingsStore.getState().storageMode).toBe("local");
  expect(useSyncStatusStore.getState().initialSyncComplete).toBe(false);
  expect(useSyncStatusStore.getState().queueDepth).toBe(0);
  // The user's own data always stays on the device.
  expect(await db.intakeRecords.get("local-row")).toBeDefined();
}

beforeEach(async () => {
  vi.clearAllMocks();
  apiFetch.mockResolvedValue(ok());
  deleteUser.mockResolvedValue({ data: {}, error: null });
  await seedSyncState();
});

describe("switchToLocalAndWipeCloud", () => {
  it("stops the engine, pulls, wipes the server, then goes local-only keeping local data", async () => {
    const order: string[] = [];
    engine.runPullCycle.mockImplementation(async () => {
      order.push("pull");
      return true;
    });
    engine.stopEngine.mockImplementation(() => order.push("stop"));
    apiFetch.mockImplementation(async (url: string) => {
      order.push(url);
      return ok();
    });

    await switchToLocalAndWipeCloud();

    expect(order).toEqual(["stop", "pull", "/api/sync/wipe"]);
    expect(engine.startEngine).not.toHaveBeenCalled();
    await expectSeveredToLocal();
  });

  it("restarts the engine and keeps cloud sync when the wipe is rejected", async () => {
    apiFetch.mockResolvedValue(fail());

    await expect(switchToLocalAndWipeCloud()).rejects.toThrow("Failed to wipe cloud data");

    expect(engine.startEngine).toHaveBeenCalledTimes(1);
    await expectSyncLinkIntact();
  });

  it("restarts the engine and rethrows when the wipe request errors", async () => {
    apiFetch.mockRejectedValue(new Error("offline"));

    await expect(switchToLocalAndWipeCloud()).rejects.toThrow("offline");

    expect(engine.startEngine).toHaveBeenCalledTimes(1);
    await expectSyncLinkIntact();
  });

  it("never wipes the server when the pre-wipe pull fails", async () => {
    engine.runPullCycle.mockRejectedValue(new Error("pull failed"));

    await expect(switchToLocalAndWipeCloud()).rejects.toThrow("pull failed");

    expect(apiFetch).not.toHaveBeenCalled();
    expect(engine.startEngine).toHaveBeenCalledTimes(1);
    await expectSyncLinkIntact();
  });

  it("never wipes the server when the pre-wipe pull is incomplete", async () => {
    engine.runPullCycle.mockResolvedValue(false);

    await expect(switchToLocalAndWipeCloud()).rejects.toThrow("Couldn't download your cloud data");

    expect(apiFetch).not.toHaveBeenCalled();
    expect(engine.startEngine).toHaveBeenCalledTimes(1);
    await expectSyncLinkIntact();
  });
});

describe("deleteAccount", () => {
  it("stops the engine, scrubs the server, deletes the login, goes local-only and signs out", async () => {
    await deleteAccount();

    expect(engine.stopEngine).toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith("/api/account/delete", { method: "POST" });
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(engine.startEngine).not.toHaveBeenCalled();
    expect(handleSignOut).toHaveBeenCalledTimes(1);
    await expectSeveredToLocal();
  });

  it("restarts the engine and does not touch the login when the data scrub fails", async () => {
    apiFetch.mockResolvedValue(fail());

    await expect(deleteAccount()).rejects.toThrow("Failed to delete account data");

    expect(engine.startEngine).toHaveBeenCalledTimes(1);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(handleSignOut).not.toHaveBeenCalled();
    await expectSyncLinkIntact();
  });

  it("surfaces a login-deletion error without restarting sync or signing out", async () => {
    deleteUser.mockResolvedValue({ data: null, error: { message: "session expired" } });

    await expect(deleteAccount()).rejects.toThrow("session expired");

    // The server data is already gone: restarting sync would re-upload it.
    expect(engine.startEngine).not.toHaveBeenCalled();
    expect(handleSignOut).not.toHaveBeenCalled();
  });

  it("reports a generic retry message when the login deletion throws", async () => {
    deleteUser.mockRejectedValue(new Error("network"));

    await expect(deleteAccount()).rejects.toThrow(/removing your login failed/);

    expect(engine.startEngine).not.toHaveBeenCalled();
    expect(handleSignOut).not.toHaveBeenCalled();
  });
});
