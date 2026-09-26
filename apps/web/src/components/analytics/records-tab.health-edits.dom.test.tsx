// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecordsTab } from "@/components/analytics/records-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makeBloodPressureRecord,
  makeDefecationRecord,
  makeWeightRecord,
} from "@/__tests__/fixtures/db-fixtures";
/* eslint-disable-next-line no-restricted-imports -- test asserts the stored rows */
import { db } from "@/lib/db";
import type { TimeRange } from "@intake/types/analytics";

const { showUndoToastSpy } = vi.hoisted(() => ({ showUndoToastSpy: vi.fn() }));
vi.mock("@/components/medications/undo-toast", () => ({
  showUndoToast: showUndoToastSpy,
}));

const DAY_MS = 86_400_000;
const RANGE: TimeRange = { start: 0, end: Date.now() + DAY_MS };
// Seconds + ms that a minute-precision datetime-local would drop.
const TS = Date.now() - 3 * 60 * 60 * 1000 - (Date.now() % 60_000) + 17_250;

describe("RecordsTab health record edits", () => {
  it("weight edit clears the note and keeps the exact timestamp", async () => {
    const user = userEvent.setup();
    const seed = makeWeightRecord({ weight: 72.35, note: "voice", timestamp: TS });
    await renderWithFixtures(<RecordsTab range={RANGE} />, {
      seed: { weightRecords: [seed] },
    });

    await screen.findByText("72.35 kg");
    await user.click(screen.getByRole("button", { name: "Edit entry" }));
    const dialog = await screen.findByRole("dialog");
    await user.clear(within(dialog).getByLabelText(/note/i));
    await user.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    await waitFor(async () => {
      const stored = await db.weightRecords.get(seed.id);
      expect(stored?.note).toBeNull();
      expect(stored?.timestamp).toBe(TS);
      expect(stored?.weight).toBe(72.35);
    });
  });

  it("BP edit refuses a swapped reading", async () => {
    const user = userEvent.setup();
    const seed = makeBloodPressureRecord({ systolic: 120, diastolic: 80, timestamp: TS });
    await renderWithFixtures(<RecordsTab range={RANGE} />, {
      seed: { bloodPressureRecords: [seed] },
    });

    await screen.findByText(/120\/80/);
    await user.click(screen.getByRole("button", { name: "Edit entry" }));
    const dialog = await screen.findByRole("dialog");
    const systolic = within(dialog).getByLabelText("Systolic");
    const diastolic = within(dialog).getByLabelText("Diastolic");
    await user.clear(systolic);
    await user.type(systolic, "80");
    await user.clear(diastolic);
    await user.type(diastolic, "120");
    await user.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const stored = await db.bloodPressureRecords.get(seed.id);
    expect([stored?.systolic, stored?.diastolic]).toEqual([120, 80]);
  });

  it("BP edit can untick irregular heartbeat", async () => {
    const user = userEvent.setup();
    const seed = makeBloodPressureRecord({ irregularHeartbeat: true, timestamp: TS });
    await renderWithFixtures(<RecordsTab range={RANGE} />, {
      seed: { bloodPressureRecords: [seed] },
    });

    await user.click(await screen.findByRole("button", { name: "Edit entry" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getAllByRole("combobox").at(-1)!);
    await user.click(await screen.findByRole("option", { name: "No" }));
    await user.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    await waitFor(async () =>
      expect((await db.bloodPressureRecords.get(seed.id))?.irregularHeartbeat).toBe(false),
    );
  });

  it("defecation edit 'No estimate' clears the stored estimate", async () => {
    const user = userEvent.setup();
    const seed = makeDefecationRecord({ amountEstimate: "large", timestamp: TS });
    await renderWithFixtures(<RecordsTab range={RANGE} />, {
      seed: { defecationRecords: [seed] },
    });

    await user.click(await screen.findByRole("button", { name: "Edit entry" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "No estimate" }));
    await user.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    await waitFor(async () =>
      expect((await db.defecationRecords.get(seed.id))?.amountEstimate).toBeNull(),
    );
  });

  it("deleting a weight offers Undo", async () => {
    showUndoToastSpy.mockClear();
    const user = userEvent.setup();
    const seed = makeWeightRecord({ weight: 77, timestamp: TS });
    await renderWithFixtures(<RecordsTab range={RANGE} />, {
      seed: { weightRecords: [seed] },
    });

    await screen.findByText("77 kg");
    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(showUndoToastSpy).toHaveBeenCalledTimes(1));
  });
});
