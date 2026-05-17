import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { db } from "@/lib/db";
import { beforeEach, afterEach, afterAll } from "vitest";
import { cleanup } from "@testing-library/react";

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

// Unmount React trees rendered during the test. The project sets
// `globals: false` so RTL's auto-cleanup doesn't register itself.
afterEach(() => {
  cleanup();
});

afterAll(async () => {
  suppressDbClosed = true;
  await db.close();
});
