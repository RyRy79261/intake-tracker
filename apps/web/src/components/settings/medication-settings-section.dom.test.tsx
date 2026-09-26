// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MedicationSettingsSection } from "@/components/settings/medication-settings-section";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { useMedicationUIStore } from "@/stores/medication-ui-store";

describe("MedicationSettingsSection", () => {
  it("has no second region picker; it points to the one in Medications", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<MedicationSettingsSection />);

    // The old duplicate Select stored "UK"/"Other", which the ISO combobox
    // and the AI search don't understand.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    const link = screen.getByRole("link", { name: /medication settings/i });
    expect(link).toHaveAttribute("href", "/medications");

    useMedicationUIStore.getState().setActiveTab("schedule");
    link.addEventListener("click", (e) => e.preventDefault());
    await user.click(link);
    expect(useMedicationUIStore.getState().activeTab).toBe("settings");
  });
});
