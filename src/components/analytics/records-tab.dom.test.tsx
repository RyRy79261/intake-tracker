// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecordsTab } from "@/components/analytics/records-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makeIntakeRecord,
  makeWeightRecord,
} from "@/__tests__/fixtures/db-fixtures";
import type { TimeRange } from "@/lib/analytics-types";

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
});
