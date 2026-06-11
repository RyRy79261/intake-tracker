// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// LiquidsCard's preset tab gates AI features on useAuthGate; open it so the
// card renders fully in the test environment (the real app needs no mock).
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => true,
}));

import { ComponentPreview } from "@/components/help/component-preview";
import { getManualPreview } from "@/components/help/preview-registry";

/**
 * Verifies the Phase 2 seam end to end: ComponentPreview creates an isolated
 * preview database, swaps it in via the `db` live binding, seeds it, and the
 * real app components — through their real hooks — read that seeded data.
 */
function renderPreview(slug: string) {
  const preview = getManualPreview(slug);
  if (!preview) throw new Error(`no preview registered for "${slug}"`);
  return render(
    <ComponentPreview seed={preview.seed}>
      {preview.render()}
    </ComponentPreview>,
  );
}

describe("ComponentPreview", () => {
  it("renders a live component against a seeded, isolated preview database", async () => {
    renderPreview("blood-pressure");

    expect(screen.getByText(/live preview/i)).toBeInTheDocument();
    // The seeded most-recent reading is 118/76 — its appearance proves the
    // active-database swap took effect and the card read the preview database.
    expect(
      await screen.findAllByText(/118\/76/, undefined, { timeout: 5000 }),
    ).not.toHaveLength(0);
  });

  it("seeds intake records for the drinks preview", async () => {
    renderPreview("logging-drinks");

    expect(
      await screen.findAllByText(/250ml/, undefined, { timeout: 5000 }),
    ).not.toHaveLength(0);
  });

  it("seeds both cards for the bathroom preview", async () => {
    renderPreview("urination-and-bowel");

    expect(
      await screen.findByText("pale", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("normal", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});
