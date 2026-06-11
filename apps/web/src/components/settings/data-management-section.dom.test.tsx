// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DataManagementSection } from "@/components/settings/data-management-section";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
// A test asserts directly on IndexedDB state to prove the "clear" mutation
// actually deleted records.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";

describe("DataManagementSection", () => {
  it("renders the export, import and clear controls", async () => {
    await renderWithFixtures(<DataManagementSection />);

    expect(screen.getByRole("button", { name: /export data/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import data/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear all data/i })).toBeInTheDocument();
  });

  it("requires a two-step confirmation before clearing data", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<DataManagementSection />);

    // First click swaps in the Cancel / Confirm pair — no destructive action yet.
    await user.click(screen.getByRole("button", { name: /clear all data/i }));

    expect(screen.getByRole("button", { name: /confirm delete/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /clear all data/i }),
    ).not.toBeInTheDocument();
  });

  it("clears the seeded IndexedDB records when the delete is confirmed", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<DataManagementSection />, {
      seed: { intakeRecords: [makeIntakeRecord(), makeIntakeRecord()] },
    });

    expect(await db.intakeRecords.count()).toBe(2);

    await user.click(screen.getByRole("button", { name: /clear all data/i }));
    await user.click(screen.getByRole("button", { name: /confirm delete/i }));

    // clearAllData mutation soft-deletes records; the confirm UI collapses back.
    await vi.waitFor(async () => {
      const remaining = await db.intakeRecords
        .filter((r) => r.deletedAt == null)
        .count();
      expect(remaining).toBe(0);
    });
    expect(
      await screen.findByRole("button", { name: /clear all data/i }),
    ).toBeInTheDocument();
  });

  it("backs out of the clear flow when Cancel is pressed", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<DataManagementSection />);

    await user.click(screen.getByRole("button", { name: /clear all data/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(
      screen.getByRole("button", { name: /clear all data/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /confirm delete/i }),
    ).not.toBeInTheDocument();
  });
});
