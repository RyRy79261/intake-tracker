// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// PresetTab gates its AI lookup input on useAuthGate; open the gate so the
// full UI (search input, save-as-preset) renders without a real session.
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => true,
}));

import { PresetTab } from "@/components/liquids/preset-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { useSettingsStore } from "@/stores/settings-store";
/* eslint-disable-next-line no-restricted-imports -- test asserts a Dexie write */
import { db } from "@/lib/db";

// Preset buttons render the name and volume in adjacent spans with no
// separating whitespace, so the accessible name is e.g. "Espresso30ml".
const ESPRESSO = "Espresso30ml";
const COFFEE = "Coffee250ml";
const BEER = "Beer330ml";

describe("PresetTab", () => {
  it("renders only the presets for the active tab", async () => {
    await renderWithFixtures(<PresetTab tab="coffee" />);

    // Default coffee presets are present
    expect(screen.getByRole("button", { name: ESPRESSO })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: COFFEE })).toBeInTheDocument();
    // Alcohol presets must NOT show on the coffee tab
    expect(
      screen.queryByRole("button", { name: BEER })
    ).not.toBeInTheDocument();
  });

  it("selecting a preset populates the volume and substance fields", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<PresetTab tab="coffee" />);

    await user.click(screen.getByRole("button", { name: ESPRESSO }));

    // Espresso default preset: 30ml volume, 210mg/100ml caffeine
    expect(screen.getByLabelText("Volume (ml)")).toHaveValue(30);
    expect(screen.getByLabelText("per 100ml (mg caffeine)")).toHaveValue(210);
    expect(screen.getByLabelText("coffee name")).toHaveValue("Espresso");

    // Calculated display reflects 30/100 * 210 ≈ 63 mg
    expect(screen.getByText(/63 mg caffeine/)).toBeInTheDocument();
  });

  it("disables Log Entry until a loggable substance is present", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<PresetTab tab="coffee" />);

    const logButton = screen.getByRole("button", { name: "Log Entry" });
    expect(logButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: ESPRESSO }));
    expect(screen.getByRole("button", { name: "Log Entry" })).toBeEnabled();
  });

  it("logging a coffee preset writes water and substance records", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<PresetTab tab="coffee" />);

    await user.click(screen.getByRole("button", { name: COFFEE }));
    await user.click(screen.getByRole("button", { name: "Log Entry" }));

    // Default Coffee preset: 250ml volume, 38mg/100ml caffeine
    await waitFor(async () => {
      const water = await db.intakeRecords
        .where("type")
        .equals("water")
        .toArray();
      expect(water).toHaveLength(1);
      expect(water[0]!.amount).toBe(250);
    });

    const substances = await db.substanceRecords.toArray();
    expect(substances).toHaveLength(1);
    expect(substances[0]!.type).toBe("caffeine");
    // 250/100 * 38 = 95mg
    expect(substances[0]!.amountMg).toBe(95);
  });

  it("alcohol tab uses the % ABV field and records a standard-drinks substance", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<PresetTab tab="alcohol" />);

    await user.click(screen.getByRole("button", { name: BEER }));
    expect(screen.getByLabelText("% ABV")).toHaveValue(5);
    expect(screen.getByText(/5% ABV/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Log Entry" }));

    await waitFor(async () => {
      const substances = await db.substanceRecords.toArray();
      expect(substances).toHaveLength(1);
      expect(substances[0]!.type).toBe("alcohol");
      expect(substances[0]!.abvPercent).toBe(5);
    });
  });

  it("shows an empty-state message when the tab has no presets", async () => {
    await renderWithFixtures(<PresetTab tab="beverage" />);

    expect(screen.getByText(/No beverage presets yet/i)).toBeInTheDocument();
  });

  it("manually entered values log a substance without creating a preset", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<PresetTab tab="coffee" />);

    // Manually enter values for an ad-hoc entry.
    await user.type(screen.getByLabelText("coffee name"), "Cold Brew");
    await user.clear(screen.getByLabelText("Volume (ml)"));
    await user.type(screen.getByLabelText("Volume (ml)"), "300");
    await user.type(screen.getByLabelText("per 100ml (mg caffeine)"), "65");

    const before = useSettingsStore
      .getState()
      .liquidPresets.filter((p) => p.tab === "coffee").length;

    // Save-as-preset is gated on aiLookupUsed; without an AI lookup it stays
    // disabled, so a plain Log Entry is the supported manual path.
    await user.click(screen.getByRole("button", { name: "Log Entry" }));

    await waitFor(async () => {
      const substances = await db.substanceRecords.toArray();
      expect(substances).toHaveLength(1);
      // 300/100 * 65 = 195mg
      expect(substances[0]!.amountMg).toBe(195);
    });

    // The manual entry did not create a preset.
    expect(
      useSettingsStore
        .getState()
        .liquidPresets.filter((p) => p.tab === "coffee").length
    ).toBe(before);
  });

  it("tapping a selected preset again clears the selection", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<PresetTab tab="coffee" />);

    const espresso = screen.getByRole("button", { name: ESPRESSO });
    await user.click(espresso);
    expect(screen.getByLabelText("Volume (ml)")).toHaveValue(30);

    // Tapping the same preset deselects it and resets fields
    await user.click(espresso);
    expect(screen.getByLabelText("Volume (ml)")).toHaveValue(null);
    expect(within(espresso).getByText("Espresso")).toBeInTheDocument();
  });
});
