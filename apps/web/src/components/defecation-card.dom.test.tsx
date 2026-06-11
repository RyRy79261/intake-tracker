// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { DefecationCard } from "@/components/defecation-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeDefecationRecord } from "@/__tests__/fixtures/db-fixtures";

describe("DefecationCard", () => {
  it("renders its quick-log options", async () => {
    await renderWithFixtures(<DefecationCard />);

    expect(await screen.findByText("Defecation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Large" })).toBeInTheDocument();
  });

  it("shows a seeded record in the recent list", async () => {
    await renderWithFixtures(<DefecationCard />, {
      seed: {
        defecationRecords: [
          makeDefecationRecord({ amountEstimate: "large", note: "after lunch" }),
        ],
      },
    });

    expect(await screen.findByText("after lunch")).toBeInTheDocument();
  });
});
