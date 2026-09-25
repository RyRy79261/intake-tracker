// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UrinationCard } from "@/components/urination-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeUrinationRecord } from "@/__tests__/fixtures/db-fixtures";
import { db } from "@/lib/db";
import { getCurrentDateTimeLocal, timestampToDateTimeLocal } from "@/lib/date-utils";

const { showUndoToastSpy } = vi.hoisted(() => ({ showUndoToastSpy: vi.fn() }));
vi.mock("@/components/medications/undo-toast", () => ({
  showUndoToast: showUndoToastSpy,
}));

async function liveRecords() {
  return (await db.urinationRecords.toArray()).filter((r) => r.deletedAt === null);
}

describe("UrinationCard", () => {
  it("renders its quick-log options", async () => {
    await renderWithFixtures(<UrinationCard />);

    expect(await screen.findByText("Urination")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Large" })).toBeInTheDocument();
  });

  it("shows a seeded record in the recent list", async () => {
    await renderWithFixtures(<UrinationCard />, {
      seed: {
        urinationRecords: [
          makeUrinationRecord({ amountEstimate: "large", note: "pale, urgent" }),
        ],
      },
    });

    expect(await screen.findByText("pale, urgent")).toBeInTheDocument();
  });

  it("ignores an identical second quick-log tap within 2 s", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<UrinationCard />);

    const small = await screen.findByRole("button", { name: "Small" });
    await user.click(small);
    await waitFor(async () => expect(await liveRecords()).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Small" }));

    // Give a would-be second insert time to land.
    await new Promise((r) => setTimeout(r, 50));
    expect(await liveRecords()).toHaveLength(1);
  });

  it("quick-log offers an Undo that removes the new record", async () => {
    showUndoToastSpy.mockClear();
    const user = userEvent.setup();
    await renderWithFixtures(<UrinationCard />);

    await user.click(await screen.findByRole("button", { name: "Medium" }));
    await waitFor(() => expect(showUndoToastSpy).toHaveBeenCalledTimes(1));
    expect(await liveRecords()).toHaveLength(1);

    const { onUndo } = showUndoToastSpy.mock.calls[0]![0] as { onUndo: () => void };
    onUndo();
    await waitFor(async () => expect(await liveRecords()).toHaveLength(0));
  });

  it("details can log with no amount estimate", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<UrinationCard />);

    await user.click(await screen.findByRole("button", { name: /add details/i }));
    await user.click(screen.getByRole("combobox", { name: /amount/i }));
    await user.click(await screen.findByRole("option", { name: "No estimate" }));
    await user.type(screen.getByLabelText(/note \(optional\)/i), "dark colour");
    await user.click(screen.getByRole("button", { name: /record with details/i }));

    await waitFor(async () => expect(await liveRecords()).toHaveLength(1));
    const [saved] = await liveRecords();
    expect(saved!.amountEstimate).toBeUndefined();
    expect(saved!.note).toBe("dark colour");
  });

  it("details time resets to now when the panel opens", async () => {
    const user = userEvent.setup();
    const staleNow = Date.now() - 6 * 60 * 60 * 1000;
    vi.useFakeTimers({ toFake: ["Date"], now: staleNow });
    await renderWithFixtures(<UrinationCard />);
    await screen.findByText("Urination");
    vi.useRealTimers();

    await user.click(screen.getByRole("button", { name: /add details/i }));

    const when = screen.getByLabelText("When");
    expect(when).toHaveValue(getCurrentDateTimeLocal());
    expect(when).not.toHaveValue(timestampToDateTimeLocal(staleNow));
  });

  it("details rejects a time in the future", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<UrinationCard />);

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
    const seed = makeUrinationRecord({ amountEstimate: "large", note: "pale, urgent" });
    await renderWithFixtures(<UrinationCard />, {
      seed: { urinationRecords: [seed] },
    });

    await user.click(await screen.findByText("pale, urgent"));
    await user.click(screen.getByRole("combobox", { name: /amount estimate/i }));
    await user.click(await screen.findByRole("option", { name: "No estimate" }));
    await user.clear(screen.getByLabelText("Entry note"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const stored = await db.urinationRecords.get(seed.id);
      expect(stored?.amountEstimate).toBeNull();
      expect(stored?.note).toBeNull();
    });
  });
});
