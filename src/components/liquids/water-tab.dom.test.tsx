// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WaterTab } from "@/components/liquids/water-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";
/* eslint-disable-next-line no-restricted-imports -- test asserts a Dexie write */
import { db } from "@/lib/db";

/** Resolves the Minus / Plus icon buttons (icon-only, no accessible name). */
function stepperButtons(container: HTMLElement) {
  const decrement = container
    .querySelector(".lucide-minus")
    ?.closest("button") as HTMLButtonElement;
  const increment = container
    .querySelector(".lucide-plus")
    ?.closest("button") as HTMLButtonElement;
  return { decrement, increment };
}

describe("WaterTab", () => {
  it("renders the quick-set sizes and the default pending amount", async () => {
    await renderWithFixtures(<WaterTab />);

    for (const size of ["70", "100", "150", "200"]) {
      expect(screen.getByRole("button", { name: size })).toBeInTheDocument();
    }
    // Default pending amount is waterIncrement (250ml)
    expect(screen.getByText("+250ml")).toBeInTheDocument();
  });

  it("increments and decrements the pending amount by the water increment", async () => {
    const user = userEvent.setup();
    const { container } = await renderWithFixtures(<WaterTab />);
    const { decrement, increment } = stepperButtons(container);

    // Decrement is disabled at the minimum (250 == waterIncrement)
    expect(decrement).toBeDisabled();

    await user.click(increment);
    expect(screen.getByText("+500ml")).toBeInTheDocument();

    expect(decrement).toBeEnabled();
    await user.click(decrement);
    expect(screen.getByText("+250ml")).toBeInTheDocument();
  });

  it("selecting a quick-set size updates the pending amount", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<WaterTab />);

    await user.click(screen.getByRole("button", { name: "150" }));
    expect(screen.getByText("+150ml")).toBeInTheDocument();
  });

  it("logging an entry writes a water intake record to the database", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<WaterTab />);

    await user.click(screen.getByRole("button", { name: "100" }));
    await user.click(screen.getByRole("button", { name: /Confirm Entry/i }));

    await waitFor(async () => {
      const records = await db.intakeRecords
        .where("type")
        .equals("water")
        .toArray();
      expect(records).toHaveLength(1);
      expect(records[0]!.amount).toBe(100);
      expect(records[0]!.source).toBe("manual");
    });

    // Pending amount resets to the default increment after logging
    await waitFor(() =>
      expect(screen.getByText("+250ml")).toBeInTheDocument()
    );
  });

  it("renders the progress bar reflecting a seeded daily total", async () => {
    await renderWithFixtures(<WaterTab />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({
            type: "water",
            amount: 500,
            timestamp: Date.now(),
          }),
        ],
      },
      settings: { waterLimit: 1000 },
    });

    // 500 of 1000ml = 50% progress. The live query resolves async.
    const indicator = document.querySelector(
      "[role='progressbar'] > div"
    ) as HTMLElement;
    await waitFor(() =>
      expect(indicator.style.transform).toBe("translateX(-50%)")
    );
  });
});
