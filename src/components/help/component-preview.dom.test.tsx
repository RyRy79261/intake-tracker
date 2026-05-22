// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ComponentPreview } from "@/components/help/component-preview";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { seedBloodPressurePreview } from "@/lib/help/preview-data";

/**
 * Verifies the Phase 2 seam end to end: ComponentPreview creates an isolated
 * preview database, swaps it in via the `db` live binding, seeds it, and the
 * real BloodPressureCard — through its real hooks — reads that seeded data.
 */
describe("ComponentPreview", () => {
  it("renders a live component against a seeded, isolated preview database", async () => {
    render(
      <ComponentPreview seed={seedBloodPressurePreview}>
        <BloodPressureCard />
      </ComponentPreview>,
    );

    expect(screen.getByText(/live preview/i)).toBeInTheDocument();

    // seedBloodPressurePreview's most recent reading is 118/76. Its appearance
    // proves the active-database swap took effect and the card read the
    // preview database through its real data hooks.
    expect(
      await screen.findAllByText(/118\/76/, undefined, { timeout: 5000 }),
    ).not.toHaveLength(0);
  });
});
