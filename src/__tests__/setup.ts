import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { db } from "@/lib/db";
import { beforeEach, afterEach, afterAll } from "vitest";
import { cleanup } from "@testing-library/react";

// Reset database between every test to prevent state bleed
beforeEach(async () => {
  await db.delete();
  await db.open();
});

// Unmount React trees rendered during the test. The project sets
// `globals: false` so RTL's auto-cleanup doesn't register itself.
afterEach(() => {
  cleanup();
});

afterAll(async () => {
  await db.close();
});
