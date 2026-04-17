import { test, expect } from "@playwright/test";

test.describe("sync-engine", () => {
  test.skip("MISSING — sync engine not wired yet (see 43-06-PLAN.md, 43-07-PLAN.md)", () => {});

  test.skip("push: 50 intake records flush to Neon branch within 10s", async () => {
    // tag: push — required by 43-VALIDATION.md
  });

  test.skip("pull: server-written row arrives in Dexie after pullNow()", async () => {
    // tag: pull
  });

  test.skip("offline reconnect: queued writes flush automatically on setOffline(false)", async () => {
    // tag: offline reconnect
  });
});
