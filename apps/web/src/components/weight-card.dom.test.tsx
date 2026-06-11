// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { WeightCard } from "@/components/weight-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { weightSeries } from "@/__tests__/fixtures/scenarios";

/**
 * WeightCard reads both the test database (`useWeightRecords`) and the
 * settings store (`useSettings`); this confirms `renderWithFixtures` wires up
 * both for a real, unmocked render.
 */
describe("WeightCard", () => {
  it("surfaces the latest weight seeded into the database", async () => {
    await renderWithFixtures(<WeightCard />, {
      seed: { weightRecords: weightSeries(3) },
    });

    // weightSeries(3): index 0 is the most recent reading, 75.00 kg.
    expect(await screen.findAllByText(/75\.00 kg/)).not.toHaveLength(0);
  });
});
