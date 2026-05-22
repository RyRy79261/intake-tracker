// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LiquidPresetsSection } from "@/components/settings/liquid-presets-section";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { useSettingsStore } from "@/stores/settings-store";
import type { LiquidPreset } from "@/stores/settings-store";

/** Expands the collapsible section so its preset list is in the DOM. */
async function expandSection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /liquid presets/i }));
}

describe("LiquidPresetsSection", () => {
  it("lists the default presets from the settings store", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<LiquidPresetsSection />);
    await expandSection(user);

    // DEFAULT_LIQUID_PRESETS includes Espresso (caffeine) and Beer (alcohol).
    expect(await screen.findByText("Espresso")).toBeInTheDocument();
    expect(screen.getByText("Beer")).toBeInTheDocument();
    // Default presets are badged and cannot be deleted.
    expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /delete espresso/i }),
    ).not.toBeInTheDocument();
  });

  it("adds a custom preset that is written to the settings store", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<LiquidPresetsSection />);
    await expandSection(user);

    await user.click(await screen.findByRole("button", { name: /add preset/i }));

    const nameInput = await screen.findByPlaceholderText(/beverage name/i);
    await user.type(nameInput, "Cold Brew");
    await user.click(screen.getByRole("button", { name: /add preset/i }));

    // The store gains the new preset and the row renders it.
    const presets = useSettingsStore.getState().liquidPresets;
    expect(presets.some((p: LiquidPreset) => p.name === "Cold Brew")).toBe(true);
    expect(await screen.findByText("Cold Brew")).toBeInTheDocument();
  });

  it("deletes a non-default preset after the inline confirmation", async () => {
    const user = userEvent.setup();
    const custom: LiquidPreset = {
      id: "custom-1",
      name: "Kombucha",
      tab: "beverage",
      waterContentPercent: 95,
      defaultVolumeMl: 200,
      isDefault: false,
      source: "manual",
    };
    await renderWithFixtures(<LiquidPresetsSection />, {
      settings: {
        liquidPresets: [...useSettingsStore.getState().liquidPresets, custom],
      },
    });
    await expandSection(user);

    await user.click(await screen.findByRole("button", { name: /delete kombucha/i }));
    // The row swaps to a "Delete Kombucha?" confirmation prompt.
    const prompt = screen.getByText(/delete kombucha\?/i).closest("div")!;
    await user.click(
      within(prompt).getByRole("button", { name: /delete preset/i }),
    );

    expect(
      useSettingsStore.getState().liquidPresets.some(
        (p: LiquidPreset) => p.id === "custom-1",
      ),
    ).toBe(false);
    expect(screen.queryByText("Kombucha")).not.toBeInTheDocument();
  });
});
