import { describe, it, expect } from "vitest";

describe("sync-queue", () => {
  it("MISSING — sync-queue module not implemented yet (Plan 05)", () => {
    expect.fail("sync-queue.ts not implemented — see 43-05-PLAN.md");
  });

  it.todo("atomic write and enqueue rolls back both tables on throw");
  it.todo("coalesce upsert+upsert updates enqueuedAt without duplicating");
  it.todo("coalesce delete supersedes queued upsert for same recordId");
  it.todo("coalesce upsert after delete replaces delete (un-delete path)");
});
