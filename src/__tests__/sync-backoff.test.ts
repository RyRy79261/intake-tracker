import { describe, it, expect } from "vitest";

describe("sync-backoff", () => {
  it("MISSING — sync-backoff helper not implemented yet (Plan 06)", () => {
    expect.fail("nextBackoff() not implemented — see 43-06-PLAN.md");
  });

  it.todo("attempt 1 returns base delay 2000ms within ±20% jitter");
  it.todo("sequence is 2→4→8→16→32→60s before cap");
  it.todo("caps at 60000ms for attempts ≥ 6");
  it.todo("jitter factor is always within [0.8, 1.2]");
});
