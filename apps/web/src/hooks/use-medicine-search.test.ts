import { describe, it, expect, beforeEach, vi } from "vitest";
import type { UserProfile } from "@/lib/db";

let profile: Pick<UserProfile, "conditions" | "shareConditionsWithAI">;
vi.mock("@/lib/profile-service", () => ({
  getUserProfile: vi.fn(async () => profile),
}));

const call = vi.fn();
vi.mock("@/lib/ai-client", () => ({
  aiClient: { call: (...args: unknown[]) => call(...args) },
}));

import { searchMedicine } from "@/hooks/use-medicine-search";

/** The body the lookup sent. */
const sentBody = () => call.mock.calls[0]?.[1] as Record<string, unknown>;

describe("searchMedicine", () => {
  beforeEach(() => {
    call.mockReset();
    call.mockResolvedValue({ ok: true, data: {} });
  });

  it("sends the user's conditions when they share them with AI", async () => {
    profile = { conditions: ["Fast heart rate"], shareConditionsWithAI: true };
    await searchMedicine({ query: "Carvedilol" });
    expect(sentBody()).toMatchObject({ query: "Carvedilol", conditions: ["Fast heart rate"] });
  });

  it("sends no conditions when sharing is off", async () => {
    profile = { conditions: ["Fast heart rate"], shareConditionsWithAI: false };
    await searchMedicine({ query: "Carvedilol" });
    expect(sentBody()).not.toHaveProperty("conditions");
  });

  it("sends no conditions when sharing is on but the list is empty", async () => {
    profile = { conditions: [], shareConditionsWithAI: true };
    await searchMedicine({ query: "Carvedilol" });
    expect(sentBody()).not.toHaveProperty("conditions");
  });
});
