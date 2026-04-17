import { describe, it, expect } from "vitest";

describe("sync-engine", () => {
  it("MISSING — sync-engine loop not implemented yet (Plan 06)", () => {
    expect.fail("sync-engine.ts not implemented — see 43-06-PLAN.md");
  });

  it.todo("writes locally without network");
  it.todo("debounced push fires ~3s after last write when online");
  it.todo("online triggers push");
  it.todo("visibility triggers push");
  it.todo("pull startup advances cursor correctly");
  it.todo("cursor skew margin clamps advance to serverTime - 30s");
  it.todo("ack overwrites local updatedAt when local <= server");
  it.todo("ack does NOT overwrite local updatedAt when a newer local edit exists");
});
