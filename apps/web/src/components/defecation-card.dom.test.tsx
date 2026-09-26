// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DefecationCard } from "@/components/defecation-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeDefecationRecord } from "@/__tests__/fixtures/db-fixtures";
/* eslint-disable-next-line no-restricted-imports -- test asserts the stored rows */
import { db } from "@/lib/db";

vi.mock("@/components/medications/undo-toast", () => ({
  showUndoToast: vi.fn(),
}));

async function liveRecords() {
  return (await db.defecationRecords.toArray()).filter((r) => r.deletedAt === null);
}

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

  it("ignores an identical second quick-log tap within 2 s", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<DefecationCard />);

    await user.click(await screen.findByRole("button", { name: "Large" }));
    await waitFor(async () => expect(await liveRecords()).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Large" }));

    await new Promise((r) => setTimeout(r, 50));
    expect(await liveRecords()).toHaveLength(1);
  });

  it("inline edit 'No estimate' clears the stored estimate", async () => {
    const user = userEvent.setup();
    const seed = makeDefecationRecord({ amountEstimate: "large", note: "after lunch" });
    await renderWithFixtures(<DefecationCard />, {
      seed: { defecationRecords: [seed] },
    });

    await user.click(await screen.findByText("after lunch"));
    await user.click(screen.getByRole("combobox", { name: /amount estimate/i }));
    await user.click(await screen.findByRole("option", { name: "No estimate" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () =>
      expect((await db.defecationRecords.get(seed.id))?.amountEstimate).toBeNull(),
    );
  });
});
