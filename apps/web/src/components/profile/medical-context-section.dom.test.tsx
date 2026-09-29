// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MedicalContextSection } from "@/components/profile/medical-context-section";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeUserProfile,
} from "@/__tests__/fixtures/db-fixtures";

/**
 * The profile is saved through writeWithSync, so conditions and the consent
 * flags back up and cloud-sync like every other record. The sharing toggles
 * only decide what reaches the AI — the copy must not promise the data never
 * leaves the device.
 */
describe("MedicalContextSection copy", () => {
  it("does not claim conditions stay on the device", async () => {
    await renderWithFixtures(<MedicalContextSection />);

    await screen.findByText("Conditions");
    expect(screen.queryByText(/stay on this device/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/back up and sync with the rest of your data/i),
    ).toBeInTheDocument();
  });

  it("describes a sharing toggle that is off as 'not sent to the AI'", async () => {
    await renderWithFixtures(<MedicalContextSection />);

    const offCopy = await screen.findAllByText(/are not sent to the AI/i);
    expect(offCopy.length).toBeGreaterThan(0);
  });
});

describe("MedicalContextSection Health list", () => {
  it("lists the conditions under Health and the active prescriptions", async () => {
    await renderWithFixtures(<MedicalContextSection />, {
      seed: {
        userProfile: [makeUserProfile({ conditions: ["HFrEF"] })],
        prescriptions: [
          makePrescription({ id: "rx-a", genericName: "Bisoprolol", isActive: true }),
          makePrescription({ id: "rx-b", genericName: "Old drug", isActive: false }),
        ],
      },
    });

    const health = screen.getByRole("region", { name: "Health" });
    await within(health).findByText("HFrEF");
    expect(within(health).getByRole("button", { name: "Remove HFrEF" })).toBeInTheDocument();
    expect(await within(health).findByText("Bisoprolol")).toBeInTheDocument();
    expect(within(health).queryByText("Old drug")).not.toBeInTheDocument();
  });

  it("adds a condition on Enter and ignores a case-insensitive duplicate", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<MedicalContextSection />, {
      seed: { userProfile: [makeUserProfile({ conditions: ["HFrEF"] })] },
    });
    await screen.findByText("HFrEF");

    const input = screen.getByRole("textbox", { name: "Add a condition" });
    await user.type(input, "hfref{Enter}");
    expect(input).toHaveValue("");
    await user.type(input, "Dilated cardiomyopathy{Enter}");

    // The live query re-renders from the saved profile.
    await screen.findByRole("button", { name: "Remove Dilated cardiomyopathy" });
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
  });

  it("shows a sign-in note in the AI block only when signed out", async () => {
    const { unmount } = await renderWithFixtures(
      <MedicalContextSection signedIn={false} />,
    );
    expect(screen.getByText(/Sign in to use AI features/)).toBeInTheDocument();
    // The opt-ins stay reachable: they only take effect once signed in.
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    unmount();

    await renderWithFixtures(<MedicalContextSection />);
    expect(screen.queryByText(/Sign in to use AI features/)).not.toBeInTheDocument();
  });
});
