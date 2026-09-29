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

  it("labels ABV as a percentage in the preset summary", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<LiquidPresetsSection />);
    await expandSection(user);

    // Default Beer preset: alcoholPer100ml 5 means 5% ABV, not 5 std drinks.
    expect(await screen.findByText("5% ABV")).toBeInTheDocument();
    expect(screen.queryByText(/std alc/)).not.toBeInTheDocument();
  });

  it("clears a nutrient when the edit form empties it", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<LiquidPresetsSection />);
    await expandSection(user);

    await user.click(await screen.findByRole("button", { name: "Edit Coffee" }));
    await user.clear(screen.getByLabelText("Caffeine/100ml"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const coffee = useSettingsStore
      .getState()
      .liquidPresets.find((p: LiquidPreset) => p.id === "default-coffee");
    expect(coffee).toBeDefined();
    expect(coffee).not.toHaveProperty("caffeinePer100ml");
  });

  it("saves and summarises sugar per 100 ml", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<LiquidPresetsSection />);
    await expandSection(user);

    await user.click(await screen.findByRole("button", { name: /add preset/i }));
    await user.type(await screen.findByPlaceholderText(/beverage name/i), "Cola");
    await user.type(screen.getByLabelText("Sugar g/100ml"), "10.6");
    await user.click(screen.getByRole("button", { name: /add preset/i }));

    const cola = useSettingsStore
      .getState()
      .liquidPresets.find((p: LiquidPreset) => p.name === "Cola");
    expect(cola?.sugarPer100ml).toBe(10.6);
    expect(await screen.findByText(/10\.6g sugar\/100ml/)).toBeInTheDocument();
  });

  it("summarises a preset's sodium as sodium, not salt", async () => {
    const user = userEvent.setup();
    const broth: LiquidPreset = {
      id: "custom-broth",
      name: "Broth",
      tab: "beverage",
      defaultVolumeMl: 250,
      saltPer100ml: 350,
      isDefault: false,
      source: "manual",
    };
    await renderWithFixtures(<LiquidPresetsSection />, {
      settings: {
        liquidPresets: [...useSettingsStore.getState().liquidPresets, broth],
      },
    });
    await expandSection(user);

    // saltPer100ml holds sodium mg per 100 ml (see LiquidPreset).
    expect(await screen.findByText(/350mg sodium\/100ml/)).toBeInTheDocument();
    expect(screen.queryByText(/mg salt\/100ml/)).not.toBeInTheDocument();
  });

  it("hides the sugar input while the sugar tracker is off", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<LiquidPresetsSection />, {
      settings: { optionalTrackers: { sugar: false, potassium: false } },
    });
    await expandSection(user);

    await user.click(await screen.findByRole("button", { name: /add preset/i }));
    expect(screen.queryByLabelText("Sugar g/100ml")).not.toBeInTheDocument();
  });

  it("does not offer the unused Beverage category", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<LiquidPresetsSection />);
    await expandSection(user);

    await user.click(await screen.findByRole("button", { name: /add preset/i }));
    await user.click(screen.getByRole("combobox"));
    expect(
      screen.queryByRole("option", { name: "Beverage" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Coffee" })).toBeInTheDocument();
  });

  it("deletes a non-default preset after the inline confirmation", async () => {
    const user = userEvent.setup();
    const custom: LiquidPreset = {
      id: "custom-1",
      name: "Kombucha",
      tab: "beverage",
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
