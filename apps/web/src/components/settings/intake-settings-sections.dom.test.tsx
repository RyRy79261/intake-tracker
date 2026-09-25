// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WaterSettingsSection } from "@/components/settings/water-settings-section";
import { SaltSettingsSection } from "@/components/settings/salt-settings-section";
import { WeightSettingsSection } from "@/components/settings/weight-settings-section";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { useSettingsStore } from "@/stores/settings-store";

async function typeAndBlur(
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLElement,
  text: string,
) {
  await user.clear(input);
  await user.type(input, text);
  await user.tab();
}

describe("WaterSettingsSection", () => {
  it("clamps an over-max limit and explains it inline", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<WaterSettingsSection />);
    await user.click(screen.getByRole("button", { name: /water settings/i }));

    const input = await screen.findByLabelText("Daily Limit (ml)");
    await typeAndBlur(user, input, "15000");

    expect(useSettingsStore.getState().waterLimit).toBe(10000);
    expect(input).toHaveValue(10000);
    expect(screen.getByRole("alert")).toHaveTextContent(/100.*10000/);
  });

  it("shows the stored value when a fraction rounds to the current one", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<WaterSettingsSection />, {
      settings: { waterLimit: 1000 },
    });
    await user.click(screen.getByRole("button", { name: /water settings/i }));

    const input = await screen.findByLabelText("Daily Limit (ml)");
    await typeAndBlur(user, input, "1000.4");

    expect(useSettingsStore.getState().waterLimit).toBe(1000);
    expect(input).toHaveValue(1000);
  });
});

describe("SaltSettingsSection", () => {
  it("no longer offers the unused sodium increment", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<SaltSettingsSection />);
    await user.click(screen.getByRole("button", { name: /sodium settings/i }));

    expect(await screen.findByLabelText("Daily Limit (mg)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Increment (mg)")).not.toBeInTheDocument();
  });
});

describe("WeightSettingsSection", () => {
  it("no longer offers weight-graph overlay toggles that nothing reads", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<WeightSettingsSection />);
    await user.click(screen.getByRole("button", { name: /weight settings/i }));

    expect(await screen.findByLabelText("Increment (kg)")).toBeInTheDocument();
    expect(screen.queryByText(/weight graph overlays/i)).not.toBeInTheDocument();
  });
});
