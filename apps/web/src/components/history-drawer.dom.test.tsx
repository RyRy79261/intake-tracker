// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HistoryDrawer } from "@/components/history-drawer";

// vaul (the Drawer primitive) calls Pointer Capture APIs on pointer events;
// jsdom doesn't implement them, which surfaces as an unhandled exception.
// Stub them so interacting with the drawer's controls stays quiet.
beforeAll(() => {
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.hasPointerCapture = () => false;
  }
});
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makeIntakeRecord,
  makeBloodPressureRecord,
} from "@/__tests__/fixtures/db-fixtures";

const NOW = Date.now();

describe("HistoryDrawer", () => {
  it("shows the empty state when open with no seeded records", async () => {
    await renderWithFixtures(
      <HistoryDrawer open onOpenChange={() => {}} />,
    );

    expect(await screen.findByText("Health History")).toBeInTheDocument();
    expect(await screen.findByText(/no records yet/i)).toBeInTheDocument();
  });

  it("renders seeded intake and blood-pressure records inside the drawer", async () => {
    await renderWithFixtures(<HistoryDrawer open onOpenChange={() => {}} />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 333, timestamp: NOW }),
        ],
        bloodPressureRecords: [
          makeBloodPressureRecord({
            systolic: 121,
            diastolic: 81,
            timestamp: NOW,
          }),
        ],
      },
    });

    // Both record domains surface in the unified list.
    expect(await screen.findByText(/333\s*ml/i)).toBeInTheDocument();
    expect(await screen.findByText(/121\/81/)).toBeInTheDocument();
  });

  it("filters the list down to a single domain when a filter tab is chosen", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<HistoryDrawer open onOpenChange={() => {}} />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 333, timestamp: NOW }),
        ],
        bloodPressureRecords: [
          makeBloodPressureRecord({
            systolic: 121,
            diastolic: 81,
            timestamp: NOW,
          }),
        ],
      },
    });

    // Wait for data to render, then narrow to the BP tab.
    await screen.findByText(/333\s*ml/i);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "BP" }));

    expect(await screen.findByText(/121\/81/)).toBeInTheDocument();
    // The water row is filtered out once the BP tab is active.
    expect(screen.queryByText(/333\s*ml/i)).not.toBeInTheDocument();
  });

  it("renders nothing visible when open is false", async () => {
    await renderWithFixtures(
      <HistoryDrawer open={false} onOpenChange={() => {}} />,
      { seed: { intakeRecords: [makeIntakeRecord({ amount: 333 })] } },
    );

    // A closed Radix drawer keeps its content out of the accessibility tree.
    expect(screen.queryByText("Health History")).not.toBeInTheDocument();
  });
});

// Radix Drawer (vaul) measures element sizes; jsdom lacks layout APIs, so the
// suite above relies only on presence/absence assertions, not geometry.
void vi;
