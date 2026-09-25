// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WeightCard } from "@/components/weight-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { weightSeries } from "@/__tests__/fixtures/scenarios";
import { db } from "@/lib/db";
import { getCurrentDateTimeLocal, timestampToDateTimeLocal } from "@/lib/date-utils";

const { showUndoToastSpy } = vi.hoisted(() => ({ showUndoToastSpy: vi.fn() }));
vi.mock("@/components/medications/undo-toast", () => ({
  showUndoToast: showUndoToastSpy,
}));

async function liveWeights() {
  return (await db.weightRecords.toArray()).filter((r) => r.deletedAt === null);
}

/**
 * WeightCard reads both the test database (`useWeightRecords`) and the
 * settings store (`useSettings`); this confirms `renderWithFixtures` wires up
 * both for a real, unmocked render.
 */
describe("WeightCard", () => {
  it("surfaces the latest weight seeded into the database", async () => {
    await renderWithFixtures(<WeightCard />, {
      seed: { weightRecords: weightSeries(3) },
    });

    // weightSeries(3): index 0 is the most recent reading, 75.00 kg.
    expect(await screen.findAllByText(/75\.00 kg/)).not.toHaveLength(0);
  });

  it("starts empty for a first-time user instead of a placeholder weight", async () => {
    await renderWithFixtures(<WeightCard />);

    const record = await screen.findByRole("button", { name: /record weight/i });
    expect(record).toBeDisabled();
    expect(screen.getByText("--")).toBeInTheDocument();
  });

  it("stores a typed reading exactly, even with a coarse +/- increment", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<WeightCard />, {
      seed: { weightRecords: weightSeries(1) },
      settings: { weightIncrement: 1 },
    });
    await screen.findAllByText(/75\.00 kg/);

    const input = screen.getByTestId("weight-direct-input");
    await user.click(input);
    await user.clear(input);
    await user.type(input, "72.4");
    await user.tab();
    await user.click(screen.getByRole("button", { name: /record weight/i }));

    await waitFor(async () => expect(await liveWeights()).toHaveLength(2));
    const weights = (await liveWeights()).map((r) => r.weight).sort();
    expect(weights).toEqual([72.4, 75]);
  });

  it("rejects an out-of-range typed weight instead of clamping it", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<WeightCard />, {
      seed: { weightRecords: weightSeries(1) },
    });
    await screen.findAllByText(/75\.00 kg/);

    const input = screen.getByTestId("weight-direct-input");
    await user.click(input);
    await user.clear(input);
    await user.type(input, "724");
    await user.tab();
    await user.click(screen.getByRole("button", { name: /record weight/i }));

    expect(await screen.findByText(/weight seems too high/i)).toBeInTheDocument();
    expect(await liveWeights()).toHaveLength(1);
  });

  it("records the optional note with a new weight", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<WeightCard />, {
      seed: { weightRecords: weightSeries(1) },
    });
    await screen.findAllByText(/75\.00 kg/);

    await user.type(screen.getByLabelText(/weight note/i), "after dialysis");
    await user.click(screen.getByRole("button", { name: /record weight/i }));

    await waitFor(async () => {
      const notes = (await liveWeights()).map((r) => r.note);
      expect(notes).toContain("after dialysis");
    });
  });

  it("refreshes the custom time to now when the time panel opens", async () => {
    const user = userEvent.setup();
    const staleNow = Date.now() - 6 * 60 * 60 * 1000;
    vi.useFakeTimers({ toFake: ["Date"], now: staleNow });
    await renderWithFixtures(<WeightCard />, {
      seed: { weightRecords: weightSeries(1) },
    });
    await screen.findAllByText(/75\.00 kg/);
    vi.useRealTimers();

    await user.click(screen.getByRole("button", { name: /set different time/i }));

    const timeInput = screen.getByLabelText(/when was this measured/i);
    expect(timeInput).toHaveValue(getCurrentDateTimeLocal());
    expect(timeInput).not.toHaveValue(timestampToDateTimeLocal(staleNow));
  });

  it("rejects a custom time in the future", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<WeightCard />, {
      seed: { weightRecords: weightSeries(1) },
    });
    await screen.findAllByText(/75\.00 kg/);

    await user.click(screen.getByRole("button", { name: /set different time/i }));
    const timeInput = screen.getByLabelText(/when was this measured/i);
    await user.clear(timeInput);
    await user.type(timeInput, timestampToDateTimeLocal(Date.now() + 8 * 60 * 60 * 1000));
    await user.click(screen.getByRole("button", { name: /record weight/i }));

    expect(await screen.findByText(/can't be in the future/i)).toBeInTheDocument();
    expect(await liveWeights()).toHaveLength(1);
  });

  it("deleting a weight offers Undo", async () => {
    showUndoToastSpy.mockClear();
    const user = userEvent.setup();
    await renderWithFixtures(<WeightCard />, {
      seed: { weightRecords: weightSeries(1) },
    });
    await screen.findAllByText(/75\.00 kg/);

    await user.click(screen.getByRole("button", { name: /delete entry/i }));

    await waitFor(() => expect(showUndoToastSpy).toHaveBeenCalledTimes(1));
    expect(await liveWeights()).toHaveLength(0);
  });
});
