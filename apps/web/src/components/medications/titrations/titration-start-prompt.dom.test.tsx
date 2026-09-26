// @vitest-environment jsdom
/**
 * Owner decision (doses-titration-schedule#21): a planned titration step does
 * not auto-activate. Once its start date arrives the app asks the user to
 * confirm it; confirming activates it, and until then nothing changes.
 */
import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TitrationStartPrompt } from "@/components/medications/titrations/titration-start-prompt";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { db } from "@/lib/db";
import { makeMedicationPhase, makeTitrationPlan } from "@/__tests__/fixtures/db-fixtures";

const DAY = 24 * 60 * 60 * 1000;

async function seedPlan(recommendedStartDate: number, status: "draft" | "active" = "draft") {
  await db.titrationPlans.add(
    makeTitrationPlan({ id: "plan", title: "Bisoprolol step 2", status, recommendedStartDate }),
  );
  await db.medicationPhases.add(
    makeMedicationPhase("rx", {
      id: "tphase",
      type: "titration",
      titrationPlanId: "plan",
      status: status === "draft" ? "pending" : "active",
      startDate: recommendedStartDate,
    }),
  );
}

describe("TitrationStartPrompt", () => {
  it("asks to start a step whose date has arrived, without starting it", async () => {
    await seedPlan(Date.now() - DAY);
    await renderWithFixtures(<TitrationStartPrompt />);

    expect(await screen.findByText(/bisoprolol step 2/i)).toBeInTheDocument();
    expect(screen.getByText(/current doses stay in effect/i)).toBeInTheDocument();
    expect((await db.titrationPlans.get("plan"))?.status).toBe("draft");
    expect((await db.medicationPhases.get("tphase"))?.status).toBe("pending");
  });

  it("confirming activates the plan and its phases", async () => {
    const user = userEvent.setup();
    await seedPlan(Date.now() - DAY);
    await renderWithFixtures(<TitrationStartPrompt />);

    await user.click(await screen.findByRole("button", { name: /start now/i }));
    await user.click(await screen.findByRole("button", { name: /^start titration$/i }));

    await waitFor(async () => {
      expect((await db.titrationPlans.get("plan"))?.status).toBe("active");
    });
    expect((await db.medicationPhases.get("tphase"))?.status).toBe("active");
    await waitFor(() => {
      expect(screen.queryByText(/bisoprolol step 2/i)).not.toBeInTheDocument();
    });
  });

  it("'Not now' hides the prompt and changes nothing", async () => {
    const user = userEvent.setup();
    await seedPlan(Date.now() - DAY);
    await renderWithFixtures(<TitrationStartPrompt />);

    await user.click(await screen.findByRole("button", { name: /not now/i }));
    expect(screen.queryByText(/bisoprolol step 2/i)).not.toBeInTheDocument();
    expect((await db.titrationPlans.get("plan"))?.status).toBe("draft");
  });

  it("shows nothing for a step planned for a later date", async () => {
    await seedPlan(Date.now() + 3 * DAY);
    await renderWithFixtures(<TitrationStartPrompt />);

    // Let the live query settle before asserting absence.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/bisoprolol step 2/i)).not.toBeInTheDocument();
  });
});
