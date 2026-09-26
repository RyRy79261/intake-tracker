// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

// PresetTab (rendered inside the card) gates its AI lookup on useAuthGate;
// open the gate so the card renders its full UI without a real session.
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => true,
}));

import { LiquidsCard } from "@/components/liquids-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";

// Kept apart from liquids-card.dom.test.tsx, which other work also extends.
describe("LiquidsCard header status", () => {
  it("colours the header by the shared tri-state and never rounds an over-limit total to the limit", async () => {
    await renderWithFixtures(<LiquidsCard />, {
      settings: { waterLimit: 1000, waterExtendedBuffer: 500 },
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 1040, timestamp: Date.now() }),
        ],
      },
    });

    // Inside the buffer: the extended (orange) tone, as on the Today summary.
    const header = await screen.findByText(/^1\.04L \/ 1\.0L$/, undefined, {
      timeout: 5000,
    });
    expect(header.className).toMatch(/text-orange-600/);
    expect(header.className).not.toMatch(/text-red-600/);
  });
});
