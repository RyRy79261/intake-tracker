// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// PresetTab (rendered inside the card) gates its AI lookup on useAuthGate;
// open the gate so the card renders its full UI without a real session.
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => true,
}));

// No <Toaster> is mounted in these tests; capture toasts to assert on them.
const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@intake/ui/use-toast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@intake/ui/use-toast")>();
  return {
    ...actual,
    toast: toastMock,
    useToast: () => ({ ...actual.useToast(), toast: toastMock }),
  };
});

import { LiquidsCard } from "@/components/liquids-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";
import { timestampToDateTimeLocal, dateTimeLocalToTimestamp } from "@/lib/date-utils";
// Test-only direct service/DB access to seed groups and assert the result.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
// eslint-disable-next-line no-restricted-imports
import { logDrink } from "@/lib/drink-service";
// eslint-disable-next-line no-restricted-imports
import { addComposableEntry } from "@/lib/composable-entry-service";

/** The clickable Recent row showing this amount. */
async function recentEntry(amount: string) {
  return waitFor(() => {
    const row = screen
      .getAllByText(amount)
      .map((el) => el.closest('[role="button"]'))
      .find((el): el is HTMLElement => el instanceof HTMLElement);
    if (!row) throw new Error(`no recent entry row for ${amount}`);
    return row;
  });
}
import { useSettingsStore } from "@/stores/settings-store";

describe("LiquidsCard", () => {
  it("renders the tab strip", async () => {
    await renderWithFixtures(<LiquidsCard />);

    expect(await screen.findByText("Liquids")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Water" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Beverage" })).toBeInTheDocument();
  });

  it("lists a seeded water entry", async () => {
    await renderWithFixtures(<LiquidsCard />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 250, source: "manual" }),
        ],
      },
    });

    expect(await screen.findAllByText("250ml")).not.toHaveLength(0);
  });

  const colaSeed = () => ({
    intakeRecords: [
      makeIntakeRecord({
        type: "water",
        amount: 330,
        source: "preset:manual",
        note: "Cola",
        groupId: "g-cola",
      }),
      makeIntakeRecord({
        type: "sugar",
        amount: 35,
        source: "manual:sugar",
        groupId: "g-cola",
      }),
    ],
  });

  it("labels a drink row from its note and shows its sugar", async () => {
    await renderWithFixtures(<LiquidsCard />, { seed: colaSeed() });
    expect(await screen.findByText("35g sugar")).toBeInTheDocument();
    expect(screen.getByText("Cola")).toBeInTheDocument();
  });

  // A disabled tracker is hidden from every surface (optional-trackers.ts);
  // the Food card's recent list already hid its sugar badge.
  it("hides the sugar badge while the sugar tracker is off", async () => {
    await renderWithFixtures(<LiquidsCard />, { seed: colaSeed() });
    // Wait for the sugar totals to load before switching the tracker off, so
    // the badge's absence can't just be the query still in flight.
    expect(await screen.findByText("35g sugar")).toBeInTheDocument();

    act(() => useSettingsStore.getState().setOptionalTracker("sugar", false));

    await waitFor(() =>
      expect(screen.queryByText("35g sugar")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Cola")).toBeInTheDocument();
  });

  it("does not bring back a cleared caffeine record from the preset on an unrelated edit", async () => {
    const user = userEvent.setup();
    const drink = await logDrink({
      volumeMl: 45,
      description: "Espresso",
      caffeineMg: 63,
      waterSource: "preset:default-espresso",
    });
    if (!drink.success) throw new Error("logDrink failed");
    // The user cleared the caffeine earlier.
    await db.substanceRecords.update(drink.data.substanceIds[0]!, { deletedAt: 1 });

    await renderWithFixtures(<LiquidsCard />);
    await user.click(await recentEntry("45ml"));
    const caffeine = (await screen.findByLabelText(/Caffeine \(mg\)/)) as HTMLInputElement;
    expect(caffeine.value).toBe("");

    await user.clear(screen.getByLabelText(/^Note/));
    await user.type(screen.getByLabelText(/^Note/), "decaf");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      expect((await db.intakeRecords.get(drink.data.waterIntakeId))?.note).toBe("decaf");
    });
    const live = (await db.substanceRecords.toArray()).filter((r) => r.deletedAt === null);
    expect(live).toHaveLength(0);
  });

  // ai-routes-models#9: a spirit's water row is smaller than the drink. The
  // edit form used to send the water amount as the drink volume, so a
  // time-only edit cut the alcohol record to the water amount.
  it("keeps a spirit's drink volume and standard drinks through a time-only edit", async () => {
    const user = userEvent.setup();
    const drink = await logDrink({
      volumeMl: 45,
      description: "Vodka",
      abvPercent: 40,
      waterContentPercent: 60,
      waterSource: "preset:default-spirit",
    });
    if (!drink.success) throw new Error("logDrink failed");
    const before = (await db.substanceRecords.get(drink.data.substanceIds[0]!))!;

    await renderWithFixtures(<LiquidsCard />);
    await user.click(await recentEntry("27ml"));
    const abv = (await screen.findByLabelText(/Alcohol \(% ABV\)/)) as HTMLInputElement;
    await waitFor(() => expect(abv.value).toBe("40"));

    const earlier = timestampToDateTimeLocal(Date.now() - 3_600_000);
    fireEvent.change(screen.getByLabelText(/Date and time/), { target: { value: earlier } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    const expected = dateTimeLocalToTimestamp(earlier);
    await waitFor(async () => {
      expect((await db.substanceRecords.get(before.id))?.timestamp).toBe(expected);
    });
    const after = (await db.substanceRecords.get(before.id))!;
    expect(after.volumeMl).toBe(45);
    expect(after.amountStandardDrinks).toBe(before.amountStandardDrinks);
    expect((await db.intakeRecords.get(drink.data.waterIntakeId))?.amount).toBe(27);
  });

  // liquids-save#12: parseInt read "1e3" as 1 ml.
  it("parses the edited amount as a number, so 1e3 is 1000 ml", async () => {
    const user = userEvent.setup();
    const record = makeIntakeRecord({ type: "water", amount: 250, source: "manual" });
    await renderWithFixtures(<LiquidsCard />, { seed: { intakeRecords: [record] } });
    await user.click(await recentEntry("250ml"));

    fireEvent.change(await screen.findByLabelText("Amount (ml)"), { target: { value: "1e3" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      expect((await db.intakeRecords.get(record.id))?.amount).toBe(1000);
    });
  });

  it("rejects a fractional edited amount instead of truncating it", async () => {
    const user = userEvent.setup();
    const record = makeIntakeRecord({ type: "water", amount: 250, source: "manual" });
    await renderWithFixtures(<LiquidsCard />, { seed: { intakeRecords: [record] } });
    await user.click(await recentEntry("250ml"));

    fireEvent.change(await screen.findByLabelText("Amount (ml)"), { target: { value: "250.7" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringMatching(/whole number/i) }),
      ),
    );
    expect((await db.intakeRecords.get(record.id))?.amount).toBe(250);
  });

  // liquids-save#9: the Recent label is the water row's note, so renaming a
  // drink must rename the note too, or the edit looks like it didn't save.
  it("renaming a drink relabels its row", async () => {
    const user = userEvent.setup();
    const drink = await logDrink({
      volumeMl: 250,
      description: "Coffee",
      caffeineMg: 95,
      waterSource: "preset:manual",
    });
    if (!drink.success) throw new Error("logDrink failed");

    await renderWithFixtures(<LiquidsCard />);
    await user.click(await recentEntry("250ml"));
    const name = (await screen.findByLabelText(/Beverage name/)) as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe("Coffee"));

    await user.clear(name);
    await user.type(name, "Flat white");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      expect((await db.intakeRecords.get(drink.data.waterIntakeId))?.note).toBe("Flat white");
    });
    const caffeine = await db.substanceRecords.get(drink.data.substanceIds[0]!);
    expect(caffeine?.description).toBe("Flat white");
  });

  it("keeps a note the user typed when renaming a drink", async () => {
    const user = userEvent.setup();
    const drink = await logDrink({
      volumeMl: 250,
      description: "Coffee",
      caffeineMg: 95,
      waterSource: "preset:manual",
    });
    if (!drink.success) throw new Error("logDrink failed");

    await renderWithFixtures(<LiquidsCard />);
    await user.click(await recentEntry("250ml"));
    const name = (await screen.findByLabelText(/Beverage name/)) as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe("Coffee"));

    await user.clear(name);
    await user.type(name, "Flat white");
    await user.clear(screen.getByLabelText(/^Note/));
    await user.type(screen.getByLabelText(/^Note/), "oat milk");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      expect((await db.intakeRecords.get(drink.data.waterIntakeId))?.note).toBe("oat milk");
    });
  });

  it("edits a meal's water row as part of the meal: no drink fields, time moves the meal", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    const meal = await addComposableEntry(
      {
        eating: { note: "Banana" },
        intakes: [
          { type: "water", amount: 90, source: "manual:food_water_content" },
          { type: "potassium", amount: 420, source: "manual:potassium" },
        ],
      },
      now,
    );
    if (!meal.success) throw new Error("add failed");

    await renderWithFixtures(<LiquidsCard />);
    await user.click(await recentEntry("90ml"));
    expect(await screen.findByTestId("liquid-edit-meal-hint")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Caffeine \(mg\)/)).not.toBeInTheDocument();

    const earlier = timestampToDateTimeLocal(now - 3 * 3_600_000);
    fireEvent.change(screen.getByLabelText(/Date and time/), { target: { value: earlier } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    const expected = dateTimeLocalToTimestamp(earlier);
    await waitFor(async () => {
      expect((await db.eatingRecords.get(meal.data.eatingId!))?.timestamp).toBe(expected);
    });
    for (const id of meal.data.intakeIds) {
      expect((await db.intakeRecords.get(id))?.timestamp).toBe(expected);
    }
  });
});
