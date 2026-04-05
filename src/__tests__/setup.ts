import "fake-indexeddb/auto";
import { db } from "@/lib/db";
import { beforeEach, afterAll } from "vitest";

// Reset database between every test to prevent state bleed
beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterAll(async () => {
  await db.close();
});
