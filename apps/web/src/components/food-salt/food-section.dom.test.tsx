// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Radix Select's pointer handling calls DOM APIs that jsdom does not
// implement; stub them so the dropdown can open inside a test.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

// FoodSection gates its AI parse helper on useAuthGate; close the gate so the
// component renders its plain detail-entry UI without a session.
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => false,
}));

import { FoodSection } from "@/components/food-salt/food-section";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeEatingRecord, makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";
// Test-only direct DB access to assert what the save wrote.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";

describe("FoodSection", () => {
  it("renders the detail-entry fields and the record button", async () => {
    await renderWithFixtures(<FoodSection />);

    expect(await screen.findByLabelText(/Describe what you ate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Weight \(g\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sodium/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record with details" }),
    ).toBeInTheDocument();
  });

  it("disables the record button until some value is entered", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<FoodSection />);

    const recordButton = await screen.findByRole("button", {
      name: "Record with details",
    });
    expect(recordButton).toBeDisabled();
    expect(
      screen.getByText(/sodium, water, sugar or potassium amount to enable saving/i),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Sodium/i), "300");
    expect(recordButton).toBeEnabled();
  });

  it("enables the record button for a water-only entry (no sodium)", async () => {
    // A drink the AI parses as water + sugar with no sodium used to be
    // unsavable, and its parsed values were discarded.
    const user = userEvent.setup();
    await renderWithFixtures(<FoodSection />);

    const recordButton = await screen.findByRole("button", {
      name: "Record with details",
    });
    expect(recordButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Water/i), "240");
    expect(recordButton).toBeEnabled();
  });

  it("records a plain meal with only a description (no nutrient values)", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<FoodSection />);

    const recordButton = await screen.findByRole("button", {
      name: "Record with details",
    });
    await user.type(screen.getByLabelText(/Describe what you ate/i), "Grilled chicken");
    expect(recordButton).toBeEnabled();
    await user.click(recordButton);

    await waitFor(async () => {
      const eatings = await db.eatingRecords.toArray();
      expect(eatings.map((e) => e.note)).toEqual(["Grilled chicken"]);
    });
    expect(await db.intakeRecords.count()).toBe(0);
  });

  it("shows the converted sodium hint when the source is salt", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<FoodSection />);

    await user.type(await screen.findByLabelText(/Sodium/i), "1000");
    // 1000 mg of table salt -> ~393 mg sodium (SODIUM_FRACTION 0.393).
    await user.click(screen.getByRole("combobox", { name: "Measured as" }));
    await user.click(screen.getByRole("option", { name: "Salt" }));

    expect(await screen.findByText("= 393mg sodium")).toBeInTheDocument();
  });

  // Salt is not sodium: the record stores sodium mg, and keeps what was typed.
  it("records 2 g of salt as 786 mg sodium and keeps the entry as typed", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<FoodSection />);

    await user.type(await screen.findByLabelText(/Sodium/i), "2");
    await user.click(screen.getByRole("combobox", { name: "Measured as" }));
    await user.click(screen.getByRole("option", { name: "Salt" }));
    await user.click(screen.getByRole("combobox", { name: "Unit" }));
    await user.click(screen.getByRole("option", { name: "g" }));
    expect(await screen.findByText("= 786mg sodium")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Record with details" }));

    await waitFor(async () => {
      const salt = (await db.intakeRecords.toArray()).find((r) => r.type === "salt");
      expect(salt).toMatchObject({
        amount: 786,
        sodiumSource: "salt",
        sourceAmount: 2,
        sourceUnit: "g",
      });
    });
  });

  it("converts MSG with its own ~12.3% sodium fraction", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<FoodSection />);

    await user.type(await screen.findByLabelText(/Sodium/i), "1000");
    await user.click(screen.getByRole("combobox", { name: "Measured as" }));
    await user.click(screen.getByRole("option", { name: "MSG" }));

    expect(await screen.findByText("= 123mg sodium")).toBeInTheDocument();
  });

  it("opens an edit with the salt amount and unit that were typed", async () => {
    const user = userEvent.setup();
    const groupId = "g-salted";
    await renderWithFixtures(<FoodSection />, {
      seed: {
        eatingRecords: [makeEatingRecord({ note: "Salted soup", groupId, timestamp: Date.now() })],
        intakeRecords: [
          makeIntakeRecord({
            type: "salt",
            amount: 786,
            source: "manual:salt",
            sodiumSource: "salt",
            sourceAmount: 2,
            sourceUnit: "g",
            groupId,
          }),
        ],
      },
    });

    await user.click(await screen.findByText("Salted soup"));
    await waitFor(() => {
      expect(screen.getByLabelText("Sodium", { selector: "#edit-eating-sodium" })).toHaveValue(2);
    });
    expect(screen.getByRole("combobox", { name: "Edit measured as" })).toHaveTextContent("Salt");
    expect(screen.getByRole("combobox", { name: "Edit unit" })).toHaveTextContent("g");
  });

  it("opens a legacy sodium row as sodium mg with its stored value", async () => {
    // Pre-source rows stored sodium mg even when typed as salt; they are read
    // as sodium with an unknown source, never back-converted.
    const user = userEvent.setup();
    const groupId = "g-legacy";
    await renderWithFixtures(<FoodSection />, {
      seed: {
        eatingRecords: [makeEatingRecord({ note: "Old chips", groupId, timestamp: Date.now(), updatedAt: 1 })],
        intakeRecords: [
          makeIntakeRecord({ type: "salt", amount: 780, source: "manual:salt", groupId }),
        ],
      },
    });

    await user.click(await screen.findByText("Old chips"));
    await waitFor(() => {
      expect(screen.getByLabelText("Sodium", { selector: "#edit-eating-sodium" })).toHaveValue(780);
    });
    expect(screen.getByRole("combobox", { name: "Edit measured as" })).toHaveTextContent("Sodium");
    expect(screen.getByRole("combobox", { name: "Edit unit" })).toHaveTextContent("mg");

    // Saving without touching sodium leaves the legacy row exactly as it was.
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      const eating = (await db.eatingRecords.toArray())[0];
      expect(eating?.updatedAt).toBeGreaterThan(1);
    });
    const salt = (await db.intakeRecords.toArray()).find((r) => r.type === "salt")!;
    expect(salt.amount).toBe(780);
    expect(salt.source).toBe("manual:salt");
    expect(salt.sodiumSource).toBeUndefined();
  });

  it("opens a row with null source fields (restored backup) as sodium mg", async () => {
    // Backups accept null for the entered-source fields; such a row has no
    // known source and must not prefill the literal text "null".
    const user = userEvent.setup();
    const groupId = "g-null-source";
    await renderWithFixtures(<FoodSection />, {
      seed: {
        eatingRecords: [makeEatingRecord({ note: "Restored soup", groupId, timestamp: Date.now(), updatedAt: 1 })],
        intakeRecords: [
          {
            ...makeIntakeRecord({ type: "salt", amount: 640, source: "manual:sodium", groupId }),
            sodiumSource: null,
            sourceAmount: null,
            sourceUnit: null,
          } as unknown as ReturnType<typeof makeIntakeRecord>,
        ],
      },
    });

    await user.click(await screen.findByText("Restored soup"));
    await waitFor(() => {
      expect(screen.getByLabelText("Sodium", { selector: "#edit-eating-sodium" })).toHaveValue(640);
    });
    expect(screen.getByRole("combobox", { name: "Edit measured as" })).toHaveTextContent("Sodium");
    expect(screen.getByRole("combobox", { name: "Edit unit" })).toHaveTextContent("mg");
  });

  it("re-records an edited sodium entry as typed", async () => {
    const user = userEvent.setup();
    const groupId = "g-edit";
    await renderWithFixtures(<FoodSection />, {
      seed: {
        eatingRecords: [makeEatingRecord({ note: "Broth", groupId, timestamp: Date.now() })],
        intakeRecords: [
          makeIntakeRecord({ type: "salt", amount: 300, source: "manual:sodium", groupId }),
        ],
      },
    });

    await user.click(await screen.findByText("Broth"));
    const input = await screen.findByLabelText("Sodium", { selector: "#edit-eating-sodium" });
    await waitFor(() => expect(input).toHaveValue(300));
    await user.clear(input);
    await user.type(input, "1.5");
    await user.click(screen.getByRole("combobox", { name: "Edit measured as" }));
    await user.click(screen.getByRole("option", { name: "Salt" }));
    await user.click(screen.getByRole("combobox", { name: "Edit unit" }));
    await user.click(screen.getByRole("option", { name: "g" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const salt = (await db.intakeRecords.toArray()).find((r) => r.type === "salt");
      expect(salt).toMatchObject({
        amount: 590, // 1.5 g × 1000 × 0.393 = 589.5 → 590
        sodiumSource: "salt",
        sourceAmount: 1.5,
        sourceUnit: "g",
      });
    });
  });

  it("records a composable entry and surfaces it in the recent list", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<FoodSection />);

    await user.type(await screen.findByLabelText(/Describe what you ate/i), "Soup");
    await user.type(screen.getByLabelText(/Sodium/i), "420");
    await user.click(
      screen.getByRole("button", { name: "Record with details" }),
    );

    // The new entry shows up in the live-query-backed recent list with its
    // note and the seeded sodium total — proof the write reached the DB.
    expect(await screen.findByText("Soup")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("420mg Na")).toBeInTheDocument();
    });
  });

  it("surfaces seeded recent eating records", async () => {
    await renderWithFixtures(<FoodSection />, {
      seed: {
        eatingRecords: [
          makeEatingRecord({ note: "Leftover curry", timestamp: Date.now() }),
        ],
      },
    });

    expect(await screen.findByText("Leftover curry")).toBeInTheDocument();
  });
});
