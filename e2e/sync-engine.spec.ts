import { test, expect } from "@playwright/test";

const DB_NAME = "IntakeTrackerDB";

/**
 * Helper: add intake records + corresponding _syncQueue entries via raw
 * IndexedDB. Works in both dev and production builds since it bypasses
 * the module system entirely.
 */
async function seedRecordsAndQueue(
  page: import("@playwright/test").Page,
  count: number,
  prefix: string,
): Promise<string[]> {
  return page.evaluate(
    async ({ count, prefix, dbName }) => {
      return new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(
            ["intakeRecords", "_syncQueue"],
            "readwrite",
          );
          const intakeStore = tx.objectStore("intakeRecords");
          const queueStore = tx.objectStore("_syncQueue");

          const ids: string[] = [];
          const now = Date.now();
          for (let i = 0; i < count; i++) {
            const id = `${prefix}-${crypto.randomUUID()}`;
            ids.push(id);
            intakeStore.add({
              id,
              type: "water",
              amount: 250,
              timestamp: now - i * 1000,
              source: prefix,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              deviceId: "e2e-test",
              timezone: "UTC",
            });
            queueStore.add({
              tableName: "intakeRecords",
              recordId: id,
              op: "upsert",
              enqueuedAt: now,
              attempts: 0,
            });
          }

          tx.oncomplete = () => resolve(ids);
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { count, prefix, dbName: DB_NAME },
  );
}

async function getQueueDepth(
  page: import("@playwright/test").Page,
): Promise<number> {
  return page.evaluate(async (dbName) => {
    return new Promise<number>((resolve) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("_syncQueue", "readonly");
        const store = tx.objectStore("_syncQueue");
        const countReq = store.count();
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => resolve(-1);
      };
      req.onerror = () => resolve(-1);
    });
  }, DB_NAME);
}

async function getServerIntakeCount(
  page: import("@playwright/test").Page,
): Promise<number> {
  return page.evaluate(async () => {
    const res = await fetch("/api/e2e-test/count-intake", { method: "POST" });
    const data = await res.json();
    return data.count;
  });
}

async function triggerSyncViaOnlineEvent(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

test.describe("sync-engine", () => {
  test.beforeEach(async ({ page }) => {
    // Enable cloud-sync storage mode so the sync engine starts
    await page.addInitScript(() => {
      const key = "intake-tracker-settings";
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.state) parsed.state.storageMode = "cloud-sync";
          localStorage.setItem(key, JSON.stringify(parsed));
        } catch {}
      } else {
        localStorage.setItem(
          key,
          JSON.stringify({ state: { storageMode: "cloud-sync" }, version: 0 }),
        );
      }
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("push: 50 intake records flush to Neon branch within 30s @sync @push", async ({
    page,
  }) => {
    const initialCount = await getServerIntakeCount(page);

    await seedRecordsAndQueue(page, 50, "e2e-push");

    await triggerSyncViaOnlineEvent(page);

    await expect(async () => {
      const count = await getServerIntakeCount(page);
      expect(count).toBeGreaterThanOrEqual(initialCount + 50);
    }).toPass({ timeout: 30_000 });
  });

  test("pull: server-written row arrives in Dexie after pullNow() @sync @pull", async ({
    page,
  }) => {
    const testId = `e2e-pull-${crypto.randomUUID()}`;
    const insertRes = await page.evaluate(
      async ({ id }) => {
        const res = await fetch("/api/e2e-test/insert-intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            type: "water",
            amount: 999,
            source: "e2e-server-insert",
            deviceId: "server-e2e",
          }),
        });
        return res.json();
      },
      { id: testId },
    );
    expect(insertRes.ok).toBe(true);

    await triggerSyncViaOnlineEvent(page);

    await expect(async () => {
      const record = await page.evaluate(
        async ({ id, dbName }) => {
          return new Promise<Record<string, unknown> | null>((resolve) => {
            const req = indexedDB.open(dbName);
            req.onsuccess = () => {
              const db = req.result;
              const tx = db.transaction("intakeRecords", "readonly");
              const store = tx.objectStore("intakeRecords");
              const getReq = store.get(id);
              getReq.onsuccess = () => resolve(getReq.result ?? null);
              getReq.onerror = () => resolve(null);
            };
            req.onerror = () => resolve(null);
          });
        },
        { id: testId, dbName: DB_NAME },
      );
      expect(record).not.toBeNull();
      expect((record as Record<string, unknown>).amount).toBe(999);
    }).toPass({ timeout: 10_000 });
  });

  test("offline reconnect: queued writes flush automatically on reconnect @sync @offline", async ({
    page,
  }) => {
    const initialCount = await getServerIntakeCount(page);
    const offlineRecordCount = 5;

    await page.context().setOffline(true);

    await seedRecordsAndQueue(page, offlineRecordCount, "e2e-offline");

    const depth = await getQueueDepth(page);
    expect(depth).toBeGreaterThanOrEqual(offlineRecordCount);

    await page.context().setOffline(false);

    await expect(async () => {
      const currentDepth = await getQueueDepth(page);
      expect(currentDepth).toBe(0);
    }).toPass({ timeout: 10_000 });

    await expect(async () => {
      const count = await getServerIntakeCount(page);
      expect(count).toBeGreaterThanOrEqual(initialCount + offlineRecordCount);
    }).toPass({ timeout: 10_000 });
  });
});
