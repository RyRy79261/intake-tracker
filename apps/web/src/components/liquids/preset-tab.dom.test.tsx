// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// PresetTab gates its AI lookup input on useAuthGate; open the gate so the
// full UI (search input, save-as-preset) renders without a real session.
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => true,
}));

// The AI lookup goes through apiFetch; each test queues the JSON it returns.
const apiFetchMock = vi.fn();
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import { PresetTab } from "@/components/liquids/preset-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { useSettingsStore, type LiquidPreset } from "@/stores/settings-store";
import { DEFAULT_LIQUID_PRESETS } from "@/lib/constants";
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

  it("asks for a sodium (not salt) amount when a volume has no substance", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<PresetTab tab="coffee" />);

    await user.type(screen.getByLabelText("Volume (ml)"), "200");
    const hint = screen.getByText(/Add a caffeine, ABV/);
    expect(hint).toHaveTextContent(/sodium/);
    expect(hint).not.toHaveTextContent(/salt/);
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
    // The volume is stored on the substance. It used to be omitted to suppress
    // the service's implicit auto-water side effect, which left a later volume
    // edit nothing to sync against.
    expect(substances[0]!.volumeMl).toBe(250);

    // Both halves share a group, so the entry can be edited and deleted as one.
    const water = await db.intakeRecords.where("type").equals("water").toArray();
    expect(water[0]!.groupId).toBeTruthy();
    expect(substances[0]!.groupId).toBe(water[0]!.groupId);
  });

  it("logging a decaf preset records the volume with no substance", async () => {
    // Gating the button on caffeine/alcohol alone made decaf, herbal tea and
    // alcohol-free beer impossible to log at all.
    const user = userEvent.setup();
    await renderWithFixtures(<PresetTab tab="coffee" />);

    await user.click(screen.getByRole("button", { name: COFFEE }));
    await user.clear(screen.getByLabelText(/caffeine/i));
    await user.type(screen.getByLabelText(/sugar/i), "5");

    const logButton = screen.getByRole("button", { name: "Log Entry" });
    expect(logButton).toBeEnabled();
    await user.click(logButton);

    await waitFor(async () => {
      const water = await db.intakeRecords.where("type").equals("water").toArray();
      expect(water).toHaveLength(1);
      expect(water[0]!.amount).toBe(250);
    });
    const sugar = await db.intakeRecords.where("type").equals("sugar").toArray();
    expect(sugar).toHaveLength(1);
    expect(sugar[0]!.amount).toBe(5);
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
    await renderWithFixtures(<PresetTab tab="alcohol" />, {
      settings: { liquidPresets: [] },
    });

    expect(screen.getByText(/No alcohol presets yet/i)).toBeInTheDocument();
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

  describe("sugar and sodium", () => {
    const SALTED: LiquidPreset = {
      id: "custom-salted",
      name: "Salted Latte",
      tab: "coffee",
      defaultVolumeMl: 200,
      waterContentPercent: 98,
      caffeinePer100ml: 30,
      saltPer100ml: 100,
      isDefault: false,
      source: "manual",
    };
    const SWEET: LiquidPreset = {
      id: "custom-sweet",
      name: "Mocha",
      tab: "coffee",
      defaultVolumeMl: 100,
      waterContentPercent: 95,
      caffeinePer100ml: 40,
      sugarPer100ml: 10,
      isDefault: false,
      source: "ai",
    };

    const COLA = {
      substancePer100ml: 10,
      defaultVolumeMl: 330,
      beverageName: "Coca-Cola",
      reasoning: "label",
      waterContentPercent: 90,
      sugarPer100ml: 10.6,
      sodiumPer100ml: 4,
    };

    function lookupReturns(body: Record<string, unknown>) {
      apiFetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => body,
      });
    }

    async function renderCoffee(extra: LiquidPreset[] = []) {
      await renderWithFixtures(<PresetTab tab="coffee" />, {
        settings: {
          liquidPresets: [
            ...DEFAULT_LIQUID_PRESETS,
            ...extra,
          ],
        },
      });
    }

    async function lookUp(
      user: ReturnType<typeof userEvent.setup>,
      query: string,
    ) {
      await user.type(
        screen.getByLabelText("Search beverages for AI lookup"),
        query,
      );
      await user.click(
        screen.getByRole("button", { name: "Look up substance content" }),
      );
    }

    async function intakesOfType(type: string) {
      return db.intakeRecords.where("type").equals(type).toArray();
    }

    beforeEach(() => {
      apiFetchMock.mockReset();
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("fills sugar from an AI lookup and records it with the sodium", async () => {
      const user = userEvent.setup();
      await renderCoffee();
      lookupReturns(COLA);

      await lookUp(user, "Coca-Cola");

      // 330 ml at 10.6 g / 100 ml
      await waitFor(() =>
        expect(screen.getByLabelText(/sugar/i)).toHaveValue(35),
      );
      expect(screen.getByText(/35 g sugar/)).toBeInTheDocument();
      expect(screen.getByText(/13 mg sodium/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Log Entry" }));
      await waitFor(async () => {
        const sugar = await intakesOfType("sugar");
        expect(sugar.map((r) => r.amount)).toEqual([35]);
      });
      const salt = await intakesOfType("salt");
      expect(salt.map((r) => r.amount)).toEqual([13]);
    });

    it("a lookup replaces stale sugar and salt from the previous drink", async () => {
      const user = userEvent.setup();
      await renderCoffee([SALTED]);

      await user.click(screen.getByRole("button", { name: "Salted Latte200ml" }));
      await user.type(screen.getByLabelText(/sugar/i), "35");

      lookupReturns({
        ...COLA,
        beverageName: "Black coffee",
        substancePer100ml: 40,
        defaultVolumeMl: 250,
        sugarPer100ml: 0,
        sodiumPer100ml: 0,
      });
      await lookUp(user, "black coffee");

      await waitFor(() =>
        expect(screen.getByLabelText("coffee name")).toHaveValue("Black coffee"),
      );
      expect(screen.getByLabelText(/sugar/i)).toHaveValue(null);

      await user.click(screen.getByRole("button", { name: "Log Entry" }));
      await waitFor(async () => {
        expect(await intakesOfType("water")).toHaveLength(1);
      });
      expect(await intakesOfType("sugar")).toHaveLength(0);
      expect(await intakesOfType("salt")).toHaveLength(0);
    });

    it("tapping or deselecting a preset clears typed sugar", async () => {
      const user = userEvent.setup();
      await renderCoffee();

      await user.type(screen.getByLabelText(/sugar/i), "35");
      const espresso = screen.getByRole("button", { name: ESPRESSO });
      await user.click(espresso);
      expect(screen.getByLabelText(/sugar/i)).toHaveValue(null);

      await user.type(screen.getByLabelText(/sugar/i), "12");
      await user.click(espresso);
      expect(screen.getByLabelText(/sugar/i)).toHaveValue(null);
    });

    it("scales a preset's sugar with the volume", async () => {
      const user = userEvent.setup();
      await renderCoffee([SWEET]);

      await user.click(screen.getByRole("button", { name: "Mocha100ml" }));
      expect(screen.getByLabelText(/sugar/i)).toHaveValue(10);

      await user.clear(screen.getByLabelText("Volume (ml)"));
      await user.type(screen.getByLabelText("Volume (ml)"), "250");
      expect(screen.getByLabelText(/sugar/i)).toHaveValue(25);

      await user.click(screen.getByRole("button", { name: "Log Entry" }));
      await waitFor(async () => {
        const sugar = await intakesOfType("sugar");
        expect(sugar.map((r) => r.amount)).toEqual([25]);
      });
    });

    it("shows salt in the summary alongside caffeine", async () => {
      const user = userEvent.setup();
      await renderCoffee([SALTED]);

      await user.click(screen.getByRole("button", { name: "Salted Latte200ml" }));
      expect(screen.getByText(/60 mg caffeine/)).toBeInTheDocument();
      expect(screen.getByText(/200 mg sodium/)).toBeInTheDocument();
    });

    it("Save as preset & log stores sugar per 100 ml on the new preset", async () => {
      const user = userEvent.setup();
      await renderCoffee();
      lookupReturns(COLA);
      await lookUp(user, "Coca-Cola");
      await waitFor(() =>
        expect(screen.getByLabelText(/sugar/i)).toHaveValue(35),
      );

      await user.click(
        screen.getByRole("button", { name: "Save as preset & log" }),
      );

      await waitFor(() => {
        const saved = useSettingsStore
          .getState()
          .liquidPresets.find((p) => p.name === "Coca-Cola");
        expect(saved).toMatchObject({
          sugarPer100ml: 10.6,
          saltPer100ml: 4,
          caffeinePer100ml: 10,
          source: "ai",
        });
      });
      expect((await intakesOfType("sugar")).map((r) => r.amount)).toEqual([35]);
    });

    it("does not save the preset when logging the drink fails", async () => {
      const user = userEvent.setup();
      await renderCoffee();
      lookupReturns(COLA);
      await lookUp(user, "Coca-Cola");
      await waitFor(() =>
        expect(screen.getByLabelText("coffee name")).toHaveValue("Coca-Cola"),
      );
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      vi.spyOn(db.intakeRecords, "add").mockRejectedValueOnce(
        new Error("disk full"),
      );

      await user.click(
        screen.getByRole("button", { name: "Save as preset & log" }),
      );

      await waitFor(() => expect(consoleError).toHaveBeenCalled());
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Save as preset & log" }),
        ).toBeEnabled(),
      );
      expect(await intakesOfType("water")).toHaveLength(0);
      expect(
        useSettingsStore
          .getState()
          .liquidPresets.some((p) => p.name === "Coca-Cola"),
      ).toBe(false);
    });

    it("tapping a preset after a lookup does not offer to save it again", async () => {
      const user = userEvent.setup();
      await renderCoffee();
      lookupReturns(COLA);
      await lookUp(user, "Coca-Cola");
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Save as preset & log" }),
        ).toBeEnabled(),
      );

      await user.click(screen.getByRole("button", { name: ESPRESSO }));

      expect(
        screen.getByRole("button", { name: "Save as preset & log" }),
      ).toBeDisabled();
    });

    it("sugar that rounds to 0 g does not count as a substance", async () => {
      const user = userEvent.setup();
      await renderCoffee();

      await user.type(screen.getByLabelText("Volume (ml)"), "250");
      await user.type(screen.getByLabelText(/sugar/i), "0.4");

      expect(screen.getByRole("button", { name: "Log Entry" })).toBeDisabled();
    });

    it("hides and drops sugar while the sugar tracker is off", async () => {
      const user = userEvent.setup();
      await renderWithFixtures(<PresetTab tab="coffee" />, {
        settings: {
          optionalTrackers: { sugar: false, potassium: false },
          liquidPresets: [
            ...DEFAULT_LIQUID_PRESETS,
            SWEET,
          ],
        },
      });

      expect(screen.queryByLabelText(/sugar/i)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Mocha100ml" }));
      expect(screen.queryByText(/g sugar/)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Log Entry" }));

      await waitFor(async () => {
        expect(await intakesOfType("water")).toHaveLength(1);
      });
      expect(await intakesOfType("sugar")).toHaveLength(0);
    });

    // The preset is configuration, not an entry: the Settings editor keeps a
    // preset's sugar while the tracker is off, so a looked-up preset should
    // too, ready for when the tracker is turned back on.
    it("keeps the looked-up sugar on a saved preset while the tracker is off", async () => {
      const user = userEvent.setup();
      await renderWithFixtures(<PresetTab tab="coffee" />, {
        settings: {
          optionalTrackers: { sugar: false, potassium: false },
          liquidPresets: [...DEFAULT_LIQUID_PRESETS],
        },
      });
      lookupReturns(COLA);
      await lookUp(user, "Coca-Cola");
      await waitFor(() =>
        expect(screen.getByLabelText("coffee name")).toHaveValue("Coca-Cola"),
      );

      await user.click(
        screen.getByRole("button", { name: "Save as preset & log" }),
      );

      await waitFor(() => {
        const saved = useSettingsStore
          .getState()
          .liquidPresets.find((p) => p.name === "Coca-Cola");
        expect(saved).toMatchObject({ sugarPer100ml: 10.6 });
      });
      expect(await intakesOfType("sugar")).toHaveLength(0);
    });
  });
});
