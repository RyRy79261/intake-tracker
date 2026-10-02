// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager } from "@tanstack/react-query";

import { WaterTab } from "@/components/liquids/water-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";
/* eslint-disable-next-line no-restricted-imports -- test asserts a Dexie write */
import { db } from "@/lib/db";
import { makeQueryClient } from "@/lib/query-client";

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
      // Disable the extended buffer so the bar runs single-stage and the
      // primary fill maps directly onto the daily limit.
      settings: { waterLimit: 1000, waterExtendedBuffer: 0 },
    });

    // 500 of 1000ml = 50%: 10 of the 20 segments filled, none hatched.
    await waitFor(() => {
      const bar = screen.getByRole("progressbar", { name: /water intake today/i });
      expect(bar).toHaveAttribute("aria-valuenow", "50");
      expect(bar.querySelectorAll("i.f")).toHaveLength(10);
      expect(bar.querySelectorAll("i.h, i.x")).toHaveLength(0);
      expect(bar).toHaveAttribute("data-state", "ok");
    });
  });

  it("renders the extended-buffer segment when the daily total spills past the target", async () => {
    await renderWithFixtures(<WaterTab />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({
            type: "water",
            amount: 1800,
            timestamp: Date.now(),
          }),
        ],
      },
      settings: { waterLimit: 1500, waterExtendedBuffer: 500 },
    });

    // 1800ml against a 1500 target: the bar spans the whole total and the
    // share past the target (round(20 * 1500 / 1800) = 17 onwards) is hatched.
    await waitFor(() => {
      const bar = screen.getByRole("progressbar", { name: /water intake today/i });
      expect(bar).toHaveAttribute("data-state", "over-target");
      expect(bar.querySelectorAll("i.f")).toHaveLength(17);
      expect(bar.querySelectorAll("i.h")).toHaveLength(3);
      expect(bar.querySelectorAll("i.x")).toHaveLength(0);
    });
  });

  it("marks the bar over the limit once past target + buffer", async () => {
    await renderWithFixtures(<WaterTab />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 2500, timestamp: Date.now() }),
        ],
      },
      settings: { waterLimit: 1500, waterExtendedBuffer: 500 },
    });

    await waitFor(() => {
      const bar = screen.getByRole("progressbar", { name: /water intake today/i });
      expect(bar).toHaveAttribute("data-state", "over-limit");
      expect(bar.querySelectorAll("i.f")).toHaveLength(12);
      expect(bar.querySelectorAll("i.x")).toHaveLength(8);
    });
  });

  describe("save reliability", () => {
    afterEach(() => {
      onlineManager.setOnline(true);
    });

    it("still writes the record while the browser reports offline", async () => {
      // Regression: React Query's default mutation networkMode ('online')
      // paused every local Dexie write after an `offline` event, leaving the
      // button on 'Recording...' and nothing in IndexedDB.
      const user = userEvent.setup();
      await renderWithFixtures(<WaterTab />, { queryClient: makeQueryClient() });

      window.dispatchEvent(new Event("offline"));
      expect(onlineManager.isOnline()).toBe(false);

      await user.click(screen.getByRole("button", { name: /Confirm Entry/i }));

      await waitFor(async () => {
        const records = await db.intakeRecords.toArray();
        expect(records).toHaveLength(1);
        expect(records[0]!.amount).toBe(250);
      });
    });

    it("two clicks dispatched in the same task write only one record", async () => {
      await renderWithFixtures(<WaterTab />);
      const button = screen.getByRole("button", { name: /Confirm Entry/i });

      // Both clicks land before React re-renders with the button disabled.
      button.click();
      button.click();

      await waitFor(async () => {
        expect(await db.intakeRecords.count()).toBeGreaterThan(0);
        expect(
          screen.getByRole("button", { name: /Confirm Entry/i })
        ).toBeEnabled();
      });
      expect(await db.intakeRecords.count()).toBe(1);
    });
  });

  describe("tap to edit", () => {
    it("sets the pending amount without writing; Confirm saves it", async () => {
      const user = userEvent.setup();
      await renderWithFixtures(<WaterTab />);

      await user.click(screen.getByRole("button", { name: /tap to edit/i }));
      const input = screen.getByLabelText("Amount (ml)");
      await user.clear(input);
      await user.type(input, "330");
      await user.click(screen.getByRole("button", { name: "Set Amount" }));

      expect(await screen.findByText("+330ml")).toBeInTheDocument();
      expect(await db.intakeRecords.count()).toBe(0);

      await user.click(screen.getByRole("button", { name: /Confirm Entry/i }));
      await waitFor(async () => {
        const records = await db.intakeRecords.toArray();
        expect(records.map((r) => r.amount)).toEqual([330]);
      });
    });

    it("cancelling the dialog leaves the pending amount unchanged", async () => {
      const user = userEvent.setup();
      await renderWithFixtures(<WaterTab />);

      await user.click(screen.getByRole("button", { name: /tap to edit/i }));
      const input = screen.getByLabelText("Amount (ml)");
      await user.clear(input);
      await user.type(input, "330");
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.getByText("+250ml")).toBeInTheDocument();
      expect(await db.intakeRecords.count()).toBe(0);
    });

    it("carries a custom time and note from the dialog into the confirmed entry only", async () => {
      const user = userEvent.setup();
      await renderWithFixtures(<WaterTab />);

      await user.click(screen.getByRole("button", { name: /tap to edit/i }));
      await user.click(
        screen.getByRole("button", { name: /Set different time/i })
      );
      fireEvent.change(screen.getByLabelText(/When did this happen/i), {
        target: { value: "2024-01-02T08:30" },
      });
      await user.click(screen.getByRole("button", { name: /Add a note/i }));
      await user.type(screen.getByLabelText(/Note \(optional\)/i), "breakfast");
      await user.click(screen.getByRole("button", { name: "Set Amount" }));

      await user.click(screen.getByRole("button", { name: /Confirm Entry/i }));
      await waitFor(async () => {
        const records = await db.intakeRecords.toArray();
        expect(records).toHaveLength(1);
        expect(records[0]!.timestamp).toBe(
          new Date("2024-01-02T08:30").getTime()
        );
        expect(records[0]!.note).toBe("breakfast");
      });

      // The custom time and note do not stick to the next entry.
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /Confirm Entry/i })
        ).toBeEnabled()
      );
      await user.click(screen.getByRole("button", { name: /Confirm Entry/i }));
      await waitFor(async () => {
        expect(await db.intakeRecords.count()).toBe(2);
      });
      const next = (await db.intakeRecords.toArray()).find(
        (r) => r.note !== "breakfast"
      );
      expect(next).toBeDefined();
      expect(Math.abs(next!.timestamp - Date.now())).toBeLessThan(60_000);
    });
  });
});
