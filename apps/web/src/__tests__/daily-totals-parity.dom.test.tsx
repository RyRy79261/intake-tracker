// @vitest-environment jsdom
/**
 * The Liquids card header, the Food card and the Today gadget all show
 * today's totals. They read them from one Daily Totals module, so for the
 * same records they show the same numbers. The MCP half of the parity check
 * (same fixture, real Postgres) is in
 * `__tests__/integration/mcp-queries.integration.test.ts`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";

vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => true,
}));

import { LiquidsCard } from "@/components/liquids-card";
import { FoodSaltCard } from "@/components/food-salt-card";
import { TodayGadget } from "@/components/home/today-gadget";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";
import { PARITY_DAY } from "@/__tests__/fixtures/daily-totals-parity";

describe("Daily totals parity: Liquids header = Food card = Today gadget", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the same totals everywhere and leaves out a record dated later today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(PARITY_DAY.now);
    await renderWithFixtures(
      <>
        <TodayGadget />
        <LiquidsCard />
        <FoodSaltCard />
      </>,
      {
        settings: {
          dayStartHour: PARITY_DAY.dayStartHour,
          waterLimit: 1000,
          waterExtendedBuffer: 500,
          saltLimit: 1500,
          saltExtendedBuffer: 500,
        },
        seed: {
          intakeRecords: PARITY_DAY.rows.map((r) => makeIntakeRecord(r)),
        },
      },
    );

    // Header: 700 ml today. The 20:00 row is in the future and does not count.
    const header = await screen.findByTestId("liquids-today-total");
    await waitFor(() => expect(header).toHaveTextContent(/^700ml$/), { timeout: 5000 });
    await waitFor(() => expect(screen.getByTestId("today-water-value")).toHaveTextContent(/^700$/));
    expect(screen.getByTestId("today-water-status")).toHaveTextContent("300 ml left");

    await waitFor(() =>
      expect(within(screen.getByTestId("food-card-sodium")).getByText("1600mg")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("today-sodium-value")).toHaveTextContent(/^1,600$/);
  });
});
