// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DaySettingsSection } from "@/components/settings/day-settings-section";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { useSettingsStore } from "@/stores/settings-store";

describe("DaySettingsSection week start", () => {
  it("shows Monday by default and saves the chosen first day", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<DaySettingsSection />);
    await user.click(screen.getByRole("button", { name: /day settings/i }));

    const trigger = await screen.findByRole("combobox", { name: /week starts on/i });
    expect(trigger).toHaveTextContent("Monday");

    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Sunday" }));
    expect(useSettingsStore.getState().weekStartsOn).toBe(0);

    await user.click(screen.getByRole("combobox", { name: /week starts on/i }));
    await user.click(await screen.findByRole("option", { name: "Saturday" }));
    expect(useSettingsStore.getState().weekStartsOn).toBe(6);
  });
});
