import { describe, it, expect } from "vitest";
import { applyPresetCaffeine } from "@/lib/voice-presets";
import { DEFAULT_LIQUID_PRESETS, type LiquidPreset } from "@/lib/constants";
import type { VoiceParsedItem } from "@/lib/voice-types";

const mokaCustom: LiquidPreset = {
  id: "custom-moka",
  name: "Moka",
  tab: "coffee",
  caffeinePer100ml: 157,
  waterContentPercent: 98,
  defaultVolumeMl: 200,
  isDefault: false,
  source: "manual",
};

describe("applyPresetCaffeine", () => {
  it("uses the matching preset's per-100 ml caffeine for a voice drink", () => {
    // The same 200 ml moka was 134 mg by voice and 314 mg by preset.
    const { items, notes } = applyPresetCaffeine(
      [{ kind: "caffeine", description: "moka coffee", caffeineMg: 134, volumeMl: 200 }],
      // Custom presets are appended after the stock ones in the store; the
      // user's own "Moka" still beats the default of the same name.
      [...DEFAULT_LIQUID_PRESETS, mokaCustom],
    );
    expect(items[0]).toMatchObject({ caffeineMg: 314 });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.itemIndices).toEqual([0]);
    expect(notes[0]!.message).toMatch(/Moka/);
  });

  it("prefers the more specific name when two presets match", () => {
    // "moka coffee" names both "Moka" and "Coffee"; the moka is what was drunk.
    const { items } = applyPresetCaffeine(
      [{ kind: "caffeine", description: "moka coffee", caffeineMg: 95, volumeMl: 100 }],
      DEFAULT_LIQUID_PRESETS,
    );
    expect(items[0]).toMatchObject({ caffeineMg: 130 });
  });

  it("leaves a drink that matches no preset alone", () => {
    const input: VoiceParsedItem[] = [
      { kind: "caffeine", description: "energy drink", caffeineMg: 80, volumeMl: 250 },
    ];
    const { items, notes } = applyPresetCaffeine(input, DEFAULT_LIQUID_PRESETS);
    expect(items).toEqual(input);
    expect(notes).toHaveLength(0);
  });

  it("leaves a drink with no volume alone", () => {
    const { items } = applyPresetCaffeine(
      [{ kind: "caffeine", description: "espresso", caffeineMg: 63 }],
      DEFAULT_LIQUID_PRESETS,
    );
    expect(items[0]).toMatchObject({ caffeineMg: 63 });
  });

  it("does not touch non-caffeine items", () => {
    const input: VoiceParsedItem[] = [
      { kind: "alcohol", description: "beer", abvPercent: 4, volumeMl: 500 },
      { kind: "water", ml: 250 },
    ];
    expect(applyPresetCaffeine(input, DEFAULT_LIQUID_PRESETS).items).toEqual(input);
  });
});
