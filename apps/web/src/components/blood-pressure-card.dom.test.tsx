// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { BloodPressureCard } from "@/components/blood-pressure-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { bloodPressureSeries } from "@/__tests__/fixtures/scenarios";

/**
 * Exercises the real BloodPressureCard with its real data hooks
 * (`useLiveQuery` against the test IndexedDB) — no per-hook mocking. This is
 * the proof that `renderWithFixtures` lets a self-fetching component run
 * against seeded fixtures.
 */
describe("BloodPressureCard", () => {
  it("surfaces the latest reading seeded into the database", async () => {
    await renderWithFixtures(<BloodPressureCard />, {
      seed: { bloodPressureRecords: bloodPressureSeries(3) },
    });

    // bloodPressureSeries(3): index 0 is the most recent reading, 118/76.
    expect(await screen.findAllByText(/118\/76/)).not.toHaveLength(0);
  });

  it("renders its input form when no readings exist", async () => {
    await renderWithFixtures(<BloodPressureCard />);

    expect(await screen.findByLabelText(/systolic/i)).toBeInTheDocument();
  });
});
