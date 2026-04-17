import { describe, it, expect } from "vitest";

describe("sync-pull-route", () => {
  it("MISSING — /api/sync/pull handler not implemented yet (Plan 04)", () => {
    expect.fail("src/app/api/sync/pull/route.ts not implemented — see 43-04-PLAN.md");
  });

  it.todo("user_id scoped: every Drizzle SELECT includes eq(table.userId, auth.userId!)");
  it.todo("returns rows with updated_at > cursor, ordered ASC");
  it.todo("soft-caps per table at PULL_SOFT_CAP (500) and sets hasMore=true when exceeded");
  it.todo("includes tombstones (deletedAt != null) in response");
  it.todo("returns serverTime for client-side skew-margin cursor clamp");
  it.todo("rejects unauthenticated requests with 401 via withAuth");
});
