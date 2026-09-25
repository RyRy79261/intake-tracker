// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { useSyncStatusStore } from "@/stores/sync-status-store";
import {
  claimSyncAccount,
  getSyncAccountId,
  SYNC_ACCOUNT_MISMATCH_ERROR,
} from "@/lib/sync-account";

async function queueOp() {
  await db._syncQueue.add({
    tableName: "intakeRecords",
    recordId: "rec-1",
    op: "upsert",
    enqueuedAt: Date.now(),
    attempts: 0,
  } as never);
}

beforeEach(() => {
  localStorage.clear();
  useSyncStatusStore.setState({ lastError: null, initialSyncComplete: true });
});

describe("claimSyncAccount (audit sync-engine#11)", () => {
  it("binds the first account to sign in on this device", async () => {
    expect(await claimSyncAccount("user-a")).toBe("ok");
    expect(getSyncAccountId()).toBe("user-a");
  });

  it("keeps an existing install's queue for the first account (no binding yet)", async () => {
    await queueOp();
    expect(await claimSyncAccount("user-a")).toBe("ok");
    expect(await db._syncQueue.count()).toBe(1);
  });

  it("the same account signing back in resumes as usual", async () => {
    await claimSyncAccount("user-a");
    await queueOp();
    await db._syncMeta.put({ tableName: "intakeRecords", lastPulledUpdatedAt: 5 } as never);
    expect(await claimSyncAccount("user-a")).toBe("ok");
    expect(await db._syncQueue.count()).toBe(1);
    expect(await db._syncMeta.count()).toBe(1);
  });

  it("blocks a different account while the previous one has pending ops, keeping them", async () => {
    await claimSyncAccount("user-a");
    await queueOp();
    expect(await claimSyncAccount("user-b")).toBe("blocked");
    expect(await db._syncQueue.count()).toBe(1);
    expect(getSyncAccountId()).toBe("user-a");
    expect(useSyncStatusStore.getState().lastError).toBe(
      SYNC_ACCOUNT_MISMATCH_ERROR,
    );
  });

  it("switches to a different account when nothing is pending: resets cursors only", async () => {
    await claimSyncAccount("user-a");
    await db._syncMeta.put({ tableName: "intakeRecords", lastPulledUpdatedAt: 5 } as never);
    await db.intakeRecords.add({
      id: "local-1",
      type: "water",
      amount: 250,
      timestamp: 1,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      deviceId: "d",
      timezone: "UTC",
    } as never);

    expect(await claimSyncAccount("user-b")).toBe("switched");
    expect(getSyncAccountId()).toBe("user-b");
    expect(await db._syncMeta.count()).toBe(0);
    expect(useSyncStatusStore.getState().initialSyncComplete).toBe(false);
    // Local records are never touched.
    expect(await db.intakeRecords.count()).toBe(1);
  });
});
