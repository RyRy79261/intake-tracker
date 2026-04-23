import "fake-indexeddb/auto";
import { db } from "@/lib/db";
import { beforeEach, afterAll } from "vitest";

// Suppress DatabaseClosedError during teardown — fake-indexeddb races with
// pending engine timers when the DB closes, producing harmless uncaught
// exceptions that make vitest exit non-zero.
let suppressDbClosed = false;
process.prependListener(
  "unhandledRejection",
  (reason: unknown, promise: Promise<unknown>) => {
    if (
      suppressDbClosed &&
      reason instanceof Error &&
      reason.name === "DatabaseClosedError"
    ) {
      promise.catch(() => {});
    }
  },
);

// Reset database between every test to prevent state bleed
beforeEach(async () => {
  suppressDbClosed = false;
  await db.delete();
  await db.open();
});

afterAll(async () => {
  suppressDbClosed = true;
  await db.close();
});
