import { describe, it, expect } from "vitest";

describe("sync-push-route", () => {
  it("MISSING — /api/sync/push handler not implemented yet (Plan 03)", () => {
    expect.fail("src/app/api/sync/push/route.ts not implemented — see 43-03-PLAN.md");
  });

  it.todo("LWW: newer client updatedAt wins over older server row");
  it.todo("server wins tie: strict > comparison means equal updatedAt keeps server row");
  it.todo("deletedAt wins: non-null deletedAt on either side prevents resurrection");
  it.todo("clamp future: client updatedAt > serverNow+60s clamps to serverNow+60s");
  it.todo("rejects client-forged userId (drizzle-zod .omit({userId:true}) — server derives from session)");
  it.todo("rejects oversized batch: z.array(opSchema).max(500) returns 400");
  it.todo("returns accepted array with serverUpdatedAt per queueId");
});
