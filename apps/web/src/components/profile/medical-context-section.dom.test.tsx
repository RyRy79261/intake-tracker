// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { MedicalContextSection } from "@/components/profile/medical-context-section";
import { renderWithFixtures } from "@/__tests__/react-test-utils";

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
