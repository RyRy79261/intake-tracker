// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BeverageTab } from "@/components/liquids/beverage-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
/* eslint-disable-next-line no-restricted-imports -- test asserts a Dexie write */
import { db } from "@/lib/db";

describe("BeverageTab", () => {
  it("renders the name input, quick sizes and sugar field", async () => {
    await renderWithFixtures(<BeverageTab />);

    expect(
      screen.getByPlaceholderText("e.g. Juice, Smoothie")
    ).toBeInTheDocument();
    for (const size of ["40", "200", "330", "500"]) {
      expect(screen.getByRole("button", { name: size })).toBeInTheDocument();
    }
    expect(screen.getByLabelText(/Sugar \(g\)/i)).toBeInTheDocument();
  });

  it("selecting a quick-set size updates the pending amount", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<BeverageTab />);

    await user.click(screen.getByRole("button", { name: "330" }));
    expect(screen.getByText("+330ml")).toBeInTheDocument();
  });

  it("logs a plain beverage as a water record using the named source", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<BeverageTab />);

    await user.type(
      screen.getByPlaceholderText("e.g. Juice, Smoothie"),
      "Orange Juice"
    );
    await user.click(screen.getByRole("button", { name: "200" }));
    await user.click(
      screen.getByRole("button", { name: /Log Beverage/i })
    );

    await waitFor(async () => {
      const records = await db.intakeRecords
        .where("type")
        .equals("water")
        .toArray();
      expect(records).toHaveLength(1);
      expect(records[0]!.amount).toBe(200);
      expect(records[0]!.source).toBe("beverage:Orange Juice");
    });

    // Name field resets after a successful log
    await waitFor(() =>
      expect(screen.getByPlaceholderText("e.g. Juice, Smoothie")).toHaveValue("")
    );
  });

  it("logs sugar alongside the drink as a grouped composable entry", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<BeverageTab />);

    await user.click(screen.getByRole("button", { name: "330" }));
    await user.type(screen.getByLabelText(/Sugar \(g\)/i), "25");
    await user.click(
      screen.getByRole("button", { name: /Log Beverage/i })
    );

    await waitFor(async () => {
      const intakes = await db.intakeRecords.toArray();
      expect(intakes).toHaveLength(2);
    });

    const intakes = await db.intakeRecords.toArray();
    const water = intakes.find((r) => r.type === "water");
    const sugar = intakes.find((r) => r.type === "sugar");
    expect(water?.amount).toBe(330);
    expect(sugar?.amount).toBe(25);
    // Water and sugar share a group id so they form one composable entry
    expect(water?.groupId).toBeTruthy();
    expect(sugar?.groupId).toBe(water?.groupId);
  });
});
