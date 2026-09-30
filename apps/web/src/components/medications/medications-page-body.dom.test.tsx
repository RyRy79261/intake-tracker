// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/auth-guard", () => ({ useAuthGate: () => true }));
vi.mock("@/hooks/use-medication-notifications", () => ({ useMedicationNotifications: () => {} }));

import { MedicationsPageBody } from "@/components/medications/medications-page-body";
import { useMedicationUIStore } from "@/stores/medication-ui-store";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makePrescription } from "@/__tests__/fixtures/db-fixtures";

/**
 * "About this medicine" replaces the tabs inside the Medications window. The
 * tabs (and the button that opened it) are hidden while it is open, so focus
 * has to be moved by hand in both directions.
 */
describe("MedicationsPageBody — About this medicine", () => {
  beforeEach(() => {
    useMedicationUIStore.setState({ activeTab: "prescriptions" });
  });

  async function openAbout(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: /Ramipril/, expanded: false }));
    const opener = await screen.findByRole("button", { name: "About this medicine" });
    await user.click(opener);
    return opener;
  }

  it("moves focus into About on open and back to the card's button on Back", async () => {
    const user = userEvent.setup();
    const ramipril = makePrescription({ genericName: "Ramipril" });
    const furosemide = makePrescription({ genericName: "Furosemide" });
    await renderWithFixtures(<MedicationsPageBody />, {
      seed: { prescriptions: [ramipril, furosemide] },
    });

    const opener = await openAbout(user);
    expect(screen.getByRole("heading", { name: "About this medicine" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Back to Rx" }));
    await waitFor(() => expect(screen.queryByTestId("about-medicine")).toBeNull());
    expect(opener).toHaveFocus();
  });

  it("About has the loaded prescription list on its first paint: a stored check is not shown as stale", async () => {
    const user = userEvent.setup();
    const ramipril = makePrescription({
      genericName: "Ramipril",
      interactionCheck: {
        checkedAt: new Date(2026, 8, 20, 12).getTime(),
        medications: ["Furosemide"],
        summary: "No important interactions were found.",
        rows: [{ medication: "Furosemide", severity: "OK", description: "Fine." }],
      },
    });
    const furosemide = makePrescription({ genericName: "Furosemide" });
    await renderWithFixtures(<MedicationsPageBody />, {
      seed: { prescriptions: [ramipril, furosemide] },
    });

    // Watch every paint of the About view, not only the settled one.
    const flashed: string[] = [];
    const observer = new MutationObserver(() => {
      for (const text of ["Your medicines changed", "You have no other active prescriptions to check against."]) {
        if (screen.queryByText(text)) flashed.push(text);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    await openAbout(user);
    expect(await screen.findByText("With Furosemide")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check interactions again" })).toBeEnabled();
    // Let any late query result land.
    await new Promise((r) => setTimeout(r, 50));
    observer.disconnect();
    expect(flashed).toEqual([]);
  });
});
