// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EstimateTrackerCard } from "@/components/estimate-tracker-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  estimateSeed,
  estimateTable,
  makeEstimateRecord,
  otherTracker,
} from "@/__tests__/fixtures/estimate-tracker-fixtures";
import { ESTIMATE_TRACKERS, ESTIMATE_TRACKER_IDS } from "@/lib/estimate-trackers";
import { getCurrentDateTimeLocal, timestampToDateTimeLocal } from "@/lib/date-utils";

const { showUndoToastSpy } = vi.hoisted(() => ({ showUndoToastSpy: vi.fn() }));
vi.mock("@/components/medications/undo-toast", () => ({
  showUndoToast: showUndoToastSpy,
}));

/** What each tracker shows that the other does not. */
const EXPECTED = {
  urination: { title: "Urination", placeholder: "e.g. colour, urgency", defaultAmount: "Small" },
  defecation: { title: "Defecation", placeholder: "e.g. consistency, urgency", defaultAmount: "Medium" },
} as const;

describe.each(ESTIMATE_TRACKER_IDS)("EstimateTrackerCard (%s)", (tracker) => {
  const expected = EXPECTED[tracker];
  const liveRecords = async () => (await estimateTable(tracker).toArray()).filter((r) => r.deletedAt === null);
  const card = () => <EstimateTrackerCard tracker={tracker} />;

  beforeEach(() => showUndoToastSpy.mockClear());

  it("renders its title, test id and quick-log options", async () => {
    await renderWithFixtures(card());

    expect(await screen.findByText(expected.title)).toBeInTheDocument();
    expect(screen.getByTestId(`${tracker}-card`)).toBeInTheDocument();
    for (const label of ["Small", "Medium", "Large"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("shows a seeded record in the recent list, and none of the other tracker's", async () => {
    await renderWithFixtures(card(), {
      seed: {
        ...estimateSeed(tracker, [makeEstimateRecord(tracker, { amountEstimate: "large", note: "mine" })]),
        ...estimateSeed(otherTracker(tracker), [makeEstimateRecord(otherTracker(tracker), { note: "not mine" })]),
      },
    });

    expect(await screen.findByText("mine")).toBeInTheDocument();
    expect(screen.queryByText("not mine")).not.toBeInTheDocument();
  });

  it("ignores an identical second quick-log tap within 2 s", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(card());

    await user.click(await screen.findByRole("button", { name: "Small" }));
    await waitFor(async () => expect(await liveRecords()).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Small" }));

    // Give a would-be second insert time to land.
    await new Promise((r) => setTimeout(r, 50));
    expect(await liveRecords()).toHaveLength(1);
  });

  it("quick-log offers an Undo that removes the new record", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(card());

    await user.click(await screen.findByRole("button", { name: "Medium" }));
    await waitFor(() => expect(showUndoToastSpy).toHaveBeenCalledTimes(1));
    expect(showUndoToastSpy.mock.calls[0]![0]).toMatchObject({
      title: "Logged",
      description: `${expected.title} (medium) recorded`,
    });
    expect(await liveRecords()).toHaveLength(1);

    const { onUndo } = showUndoToastSpy.mock.calls[0]![0] as { onUndo: () => void };
    onUndo();
    await waitFor(async () => expect(await liveRecords()).toHaveLength(0));
  });

  it("marks a quick-log tap as a manual entry", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(card());

    await user.click(await screen.findByRole("button", { name: "Large" }));
    await waitFor(async () => expect(await liveRecords()).toHaveLength(1));
    const [saved] = await liveRecords();
    expect(saved!.amountEstimate).toBe("large");
    expect(saved!.source).toBe("manual");
  });

  it("details open with the tracker's default amount and note placeholder", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(card());

    await user.click(await screen.findByRole("button", { name: /add details/i }));

    expect(screen.getByRole("combobox", { name: /amount/i })).toHaveTextContent(expected.defaultAmount);
    expect(screen.getByLabelText(/note \(optional\)/i)).toHaveAttribute("placeholder", expected.placeholder);
    expect(ESTIMATE_TRACKERS[tracker].notePlaceholder).toBe(expected.placeholder);
  });

  it("details can log with no amount estimate", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(card());

    await user.click(await screen.findByRole("button", { name: /add details/i }));
    await user.click(screen.getByRole("combobox", { name: /amount/i }));
    await user.click(await screen.findByRole("option", { name: "No estimate" }));
    await user.type(screen.getByLabelText(/note \(optional\)/i), "a note");
    await user.click(screen.getByRole("button", { name: /record with details/i }));

    await waitFor(async () => expect(await liveRecords()).toHaveLength(1));
    const [saved] = await liveRecords();
    expect(saved!.amountEstimate).toBeUndefined();
    expect(saved!.note).toBe("a note");
    expect(saved!.source).toBe("manual");
  });

  it("details time resets to now when the panel opens", async () => {
    const user = userEvent.setup();
    const staleNow = Date.now() - 6 * 60 * 60 * 1000;
    vi.useFakeTimers({ toFake: ["Date"], now: staleNow });
    await renderWithFixtures(card());
    await screen.findByText(expected.title);
    vi.useRealTimers();

    await user.click(screen.getByRole("button", { name: /add details/i }));

    const when = screen.getByLabelText("When");
    expect(when).toHaveValue(getCurrentDateTimeLocal());
    expect(when).not.toHaveValue(timestampToDateTimeLocal(staleNow));
  });

  it("details rejects a time in the future", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(card());

    await user.click(await screen.findByRole("button", { name: /add details/i }));
    const when = screen.getByLabelText("When");
    await user.clear(when);
    await user.type(when, timestampToDateTimeLocal(Date.now() + 8 * 60 * 60 * 1000));
    await user.click(screen.getByRole("button", { name: /record with details/i }));

    expect(await screen.findByText(/can't be in the future/i)).toBeInTheDocument();
    expect(await liveRecords()).toHaveLength(0);
  });

  it("inline edit clears the amount estimate and the note", async () => {
    const user = userEvent.setup();
    const seed = makeEstimateRecord(tracker, { amountEstimate: "large", note: "to clear" });
    await renderWithFixtures(card(), { seed: estimateSeed(tracker, [seed]) });

    await user.click(await screen.findByText("to clear"));
    await user.click(screen.getByRole("combobox", { name: /amount estimate/i }));
    await user.click(await screen.findByRole("option", { name: "No estimate" }));
    await user.clear(screen.getByLabelText("Entry note"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const stored = await estimateTable(tracker).get(seed.id);
      expect(stored?.amountEstimate).toBeNull();
      expect(stored?.note).toBeNull();
    });
  });
});
