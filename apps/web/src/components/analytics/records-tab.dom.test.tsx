// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecordsTab } from "@/components/analytics/records-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makeIntakeRecord,
  makeWeightRecord,
} from "@/__tests__/fixtures/db-fixtures";
import type { TimeRange } from "@intake/types/analytics";
// Test-only direct service/DB access to seed a drink group and assert the
// delete's effect on every row in it.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
// eslint-disable-next-line no-restricted-imports
import { logDrink } from "@/lib/drink-service";
// eslint-disable-next-line no-restricted-imports
import { addComposableEntry } from "@/lib/composable-entry-service";

// Capture the undo callbacks passed to the toast so tests can fire them.
const undoToastCalls = vi.hoisted(
  () => [] as Array<{ title: string; onUndo: () => Promise<void> | void }>,
);
vi.mock("@/components/medications/undo-toast", () => ({
  showUndoToast: (opts: { title: string; onUndo: () => Promise<void> | void }) => {
    undoToastCalls.push(opts);
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  undoToastCalls.length = 0;
});

/** The Delete button on the row whose measurement text matches. */
async function deleteButtonFor(text: string | RegExp) {
  const row = (await screen.findByText(text)).closest('[role="button"]') as HTMLElement;
  return within(row).getByRole("button", { name: "Delete entry" });
}

const liveCount = async () =>
  (await db.intakeRecords.toArray()).filter((r) => r.deletedAt === null).length +
  (await db.substanceRecords.toArray()).filter((r) => r.deletedAt === null).length;

const DAY_MS = 86_400_000;
const RANGE: TimeRange = { start: 0, end: Date.now() + DAY_MS };

describe("RecordsTab", () => {
  it("shows the empty state when no records fall in the range", async () => {
    await renderWithFixtures(<RecordsTab range={RANGE} />);

    expect(
      await screen.findByText("No records in this time range"),
    ).toBeInTheDocument();
  });

  it("renders seeded records grouped under their date with an entry count", async () => {
    const now = Date.now();

    await renderWithFixtures(<RecordsTab range={RANGE} />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 250, timestamp: now }),
          makeIntakeRecord({ type: "salt", amount: 480, timestamp: now }),
        ],
      },
    });

    // Both record measurements render as rows.
    expect(await screen.findByText("250 ml")).toBeInTheDocument();
    expect(screen.getByText("480 mg")).toBeInTheDocument();
    // Two same-day records render a "2 entries" group badge.
    expect(screen.getByText("2 entries")).toBeInTheDocument();
  });

  it("filters the list to a single domain when a filter tab is selected", async () => {
    const user = userEvent.setup();
    const now = Date.now();

    await renderWithFixtures(<RecordsTab range={RANGE} />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 250, timestamp: now }),
        ],
        weightRecords: [makeWeightRecord({ weight: 77, timestamp: now })],
      },
    });

    expect(await screen.findByText("250 ml")).toBeInTheDocument();
    expect(screen.getByText("77 kg")).toBeInTheDocument();

    // Switching to the Weight filter drops the water record.
    await user.click(screen.getByRole("button", { name: "Weight" }));

    expect(screen.getByText("77 kg")).toBeInTheDocument();
    expect(screen.queryByText("250 ml")).not.toBeInTheDocument();
  });

  it("opens the edit dialog pre-filled when a record's edit button is clicked", async () => {
    const user = userEvent.setup();
    const now = Date.now();

    await renderWithFixtures(<RecordsTab range={RANGE} />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 333, timestamp: now }),
        ],
      },
    });

    await screen.findByText("333 ml");
    await user.click(screen.getByRole("button", { name: "Edit entry" }));

    // The intake edit dialog opens with the amount field pre-populated.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Edit Water Entry")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Amount/)).toHaveValue(333);
  });

  it("deleting a drink's water row removes the whole drink, as on the Liquids card", async () => {
    const user = userEvent.setup();
    const drink = await logDrink({ volumeMl: 250, description: "Latte", caffeineMg: 80, sugarG: 10 });
    if (!drink.success) throw new Error("logDrink failed");
    await renderWithFixtures(<RecordsTab range={RANGE} />);

    await user.click(await deleteButtonFor(/^250 ml/));

    await waitFor(async () => expect(await liveCount()).toBe(0));
  });

  it("confirms before a caffeine delete takes the drink's water and sugar with it", async () => {
    const user = userEvent.setup();
    const drink = await logDrink({ volumeMl: 250, description: "Latte", caffeineMg: 80, sugarG: 10 });
    if (!drink.success) throw new Error("logDrink failed");
    await renderWithFixtures(<RecordsTab range={RANGE} />);

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(await deleteButtonFor(/Latte · 80 mg/));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0]![0]).toMatch(/250 ml water/);
    expect(confirm.mock.calls[0]![0]).toMatch(/10 g sugar/);
    // Cancelled: nothing removed.
    expect(await liveCount()).toBe(3);

    confirm.mockReturnValueOnce(true);
    await user.click(await deleteButtonFor(/Latte · 80 mg/));
    await waitFor(async () => expect(await liveCount()).toBe(0));

    // The toast offers Undo, which restores the drink.
    await waitFor(() => expect(undoToastCalls).toHaveLength(1));
    await undoToastCalls[0]!.onUndo();
    await waitFor(async () => expect(await liveCount()).toBe(3));
  });

  it("editing a meal's time moves its sodium and clearing the note clears it", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    const meal = await addComposableEntry(
      { eating: { note: "Dinner" }, intakes: [{ type: "salt", amount: 1400, source: "manual:sodium" }] },
      now,
    );
    if (!meal.success) throw new Error("add failed");
    await renderWithFixtures(<RecordsTab range={RANGE} />);

    const row = (await screen.findByText(/Dinner/)).closest('[role="button"]') as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Edit entry" }));
    const dialog = await screen.findByRole("dialog");
    const noteInput = within(dialog).getByDisplayValue("Dinner");
    await user.clear(noteInput);
    await user.click(within(dialog).getByRole("button", { name: /save/i }));

    await waitFor(async () => {
      const eating = await db.eatingRecords.get(meal.data.eatingId!);
      expect(eating?.note).toBeUndefined();
    });
  });
});
