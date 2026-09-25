// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BloodPressureCard } from "@/components/blood-pressure-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { bloodPressureSeries } from "@/__tests__/fixtures/scenarios";
import { db } from "@/lib/db";

async function liveReadings() {
  return (await db.bloodPressureRecords.toArray()).filter((r) => r.deletedAt === null);
}

/**
 * Exercises the real BloodPressureCard with its real data hooks
 * (`useLiveQuery` against the test IndexedDB) — no per-hook mocking. This is
 * the proof that `renderWithFixtures` lets a self-fetching component run
 * against seeded fixtures.
 */
describe("BloodPressureCard", () => {
  it("surfaces the latest reading seeded into the database", async () => {
    await renderWithFixtures(<BloodPressureCard />, {
      seed: { bloodPressureRecords: bloodPressureSeries(3) },
    });

    // bloodPressureSeries(3): index 0 is the most recent reading, 118/76.
    expect(await screen.findAllByText(/118\/76/)).not.toHaveLength(0);
  });

  it("renders its input form when no readings exist", async () => {
    await renderWithFixtures(<BloodPressureCard />);

    expect(await screen.findByLabelText(/systolic/i)).toBeInTheDocument();
  });

  it("blocks a swapped reading and offers to swap the values", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<BloodPressureCard />);

    await user.type(await screen.findByLabelText(/systolic \(top\)/i), "80");
    await user.type(screen.getByLabelText(/diastolic \(bottom\)/i), "120");
    await user.click(screen.getByRole("button", { name: /record reading/i }));

    expect(await screen.findByText(/systolic must be higher than diastolic/i)).toBeInTheDocument();
    expect(await liveReadings()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /swap values/i }));
    expect(screen.getByLabelText(/systolic \(top\)/i)).toHaveValue(120);
    expect(screen.getByLabelText(/diastolic \(bottom\)/i)).toHaveValue(80);

    await user.click(screen.getByRole("button", { name: /record reading/i }));
    await waitFor(async () => expect(await liveReadings()).toHaveLength(1));
    const [saved] = await liveReadings();
    expect([saved!.systolic, saved!.diastolic]).toEqual([120, 80]);
  });

  it("rejects a decimal reading instead of truncating it", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<BloodPressureCard />);

    await user.type(await screen.findByLabelText(/systolic \(top\)/i), "120.9");
    await user.type(screen.getByLabelText(/diastolic \(bottom\)/i), "80");
    await user.click(screen.getByRole("button", { name: /record reading/i }));

    expect(await screen.findByText(/whole number/i)).toBeInTheDocument();
    expect(await liveReadings()).toHaveLength(0);
  });

  it("records the optional note with a new reading", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<BloodPressureCard />);

    await user.type(await screen.findByLabelText(/systolic \(top\)/i), "121");
    await user.type(screen.getByLabelText(/diastolic \(bottom\)/i), "79");
    await user.click(screen.getByRole("button", { name: /more options/i }));
    await user.type(screen.getByLabelText(/blood pressure note/i), "after walk");
    await user.click(screen.getByRole("button", { name: /record reading/i }));

    await waitFor(async () => expect((await liveReadings())[0]?.note).toBe("after walk"));
  });

  it("inline edit clears heart rate, irregular heartbeat and note", async () => {
    const user = userEvent.setup();
    const seed = bloodPressureSeries(1, { irregularHeartbeat: true, note: "voice" })[0]!;
    await renderWithFixtures(<BloodPressureCard />, {
      seed: { bloodPressureRecords: [seed] },
    });

    const rows = await screen.findAllByRole("button", { name: /118\/76/ });
    await user.click(rows[rows.length - 1]!);
    await user.clear(screen.getByLabelText("Heart rate"));
    await user.click(screen.getByLabelText(/irregular heartbeat/i));
    await user.clear(screen.getByLabelText("Entry note"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const stored = await db.bloodPressureRecords.get(seed.id);
      expect(stored?.irregularHeartbeat).toBe(false);
      expect(stored?.heartRate).toBeNull();
      expect(stored?.note).toBeNull();
    });
  });

  it("inline edit rejects an out-of-range reading", async () => {
    const user = userEvent.setup();
    const seed = bloodPressureSeries(1)[0]!;
    await renderWithFixtures(<BloodPressureCard />, {
      seed: { bloodPressureRecords: [seed] },
    });

    const rows = await screen.findAllByRole("button", { name: /118\/76/ });
    await user.click(rows[rows.length - 1]!);
    const systolic = screen.getByLabelText("Systolic pressure");
    await user.clear(systolic);
    await user.type(systolic, "1200");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // The form stays open and the stored reading is unchanged.
    expect(screen.getByLabelText("Systolic pressure")).toBeInTheDocument();
    expect((await db.bloodPressureRecords.get(seed.id))?.systolic).toBe(118);
  });
});
