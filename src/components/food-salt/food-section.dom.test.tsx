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
import { makeEatingRecord } from "@/__tests__/fixtures/db-fixtures";

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

  it("disables the record button until a sodium amount is entered", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<FoodSection />);

    const recordButton = await screen.findByRole("button", {
      name: "Record with details",
    });
    expect(recordButton).toBeDisabled();
    expect(
      screen.getByText(/Enter a sodium amount to enable saving/i),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Sodium/i), "300");
    expect(recordButton).toBeEnabled();
  });

  it("shows the converted sodium hint when the source is salt", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<FoodSection />);

    await user.type(await screen.findByLabelText(/Sodium/i), "1000");
    // 1000 mg of table salt -> ~390 mg sodium (multiplier 0.39).
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Salt" }));

    expect(await screen.findByText("= 390mg sodium")).toBeInTheDocument();
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
      expect(screen.getByText("420mg")).toBeInTheDocument();
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
