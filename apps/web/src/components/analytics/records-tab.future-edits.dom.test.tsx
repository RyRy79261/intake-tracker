// @vitest-environment jsdom
/**
 * live-data-forensics#11: the Records-tab edits for intake, eating and
 * substance rows must refuse a future time, like the health-record edits and
 * the dashboard cards already do (resolveEditedTimestamp). A mistyped year
 * otherwise counts the entry in "today" until that date arrives.
 */
import { describe, it, expect } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecordsTab } from "@/components/analytics/records-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makeEatingRecord,
  makeIntakeRecord,
  makeSubstanceRecord,
} from "@/__tests__/fixtures/db-fixtures";
import { timestampToDateTimeLocal } from "@/lib/date-utils";
/* eslint-disable-next-line no-restricted-imports -- test asserts the stored rows */
import { db } from "@/lib/db";
import type { TimeRange } from "@intake/types/analytics";

const DAY_MS = 86_400_000;
const RANGE: TimeRange = { start: 0, end: Date.now() + DAY_MS };
// Seconds + ms that a minute-precision datetime-local would drop.
const TS = Date.now() - 3 * 60 * 60 * 1000 - (Date.now() % 60_000) + 17_250;
const FUTURE = timestampToDateTimeLocal(Date.now() + 2 * DAY_MS);

async function openEditAndSetTime(label: RegExp, value: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit entry" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  await user.click(within(dialog).getByRole("button", { name: "Save Changes" }));
  return dialog;
}

describe("RecordsTab edits refuse future times", () => {
  it("intake edit", async () => {
    const seed = makeIntakeRecord({ type: "water", amount: 250, timestamp: TS });
    await renderWithFixtures(<RecordsTab range={RANGE} />, { seed: { intakeRecords: [seed] } });

    await openEditAndSetTime(/^Time/, FUTURE);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect((await db.intakeRecords.get(seed.id))?.timestamp).toBe(TS);
  });

  it("intake edit keeps the exact timestamp when only the amount changes", async () => {
    const user = userEvent.setup();
    const seed = makeIntakeRecord({ type: "water", amount: 250, timestamp: TS });
    await renderWithFixtures(<RecordsTab range={RANGE} />, { seed: { intakeRecords: [seed] } });

    await user.click(await screen.findByRole("button", { name: "Edit entry" }));
    const dialog = await screen.findByRole("dialog");
    const amount = within(dialog).getByLabelText(/Amount/i);
    await user.clear(amount);
    await user.type(amount, "300");
    await user.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    await waitFor(async () => {
      const stored = await db.intakeRecords.get(seed.id);
      expect(stored?.amount).toBe(300);
      expect(stored?.timestamp).toBe(TS);
    });
  });

  it("eating edit", async () => {
    const seed = makeEatingRecord({ note: "Toast", timestamp: TS });
    await renderWithFixtures(<RecordsTab range={RANGE} />, { seed: { eatingRecords: [seed] } });

    await openEditAndSetTime(/^Time/, FUTURE);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect((await db.eatingRecords.get(seed.id))?.timestamp).toBe(TS);
  });

  it("substance edit", async () => {
    const seed = makeSubstanceRecord({
      type: "caffeine",
      amountMg: 95,
      description: "Coffee",
      timestamp: TS,
    });
    await renderWithFixtures(<RecordsTab range={RANGE} />, { seed: { substanceRecords: [seed] } });

    await openEditAndSetTime(/^Time/, FUTURE);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect((await db.substanceRecords.get(seed.id))?.timestamp).toBe(TS);
  });
});
