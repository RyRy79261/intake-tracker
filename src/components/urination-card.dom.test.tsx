// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { UrinationCard } from "@/components/urination-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeUrinationRecord } from "@/__tests__/fixtures/db-fixtures";

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
});
