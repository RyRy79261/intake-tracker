import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "@/stores/settings-store";
import { DEFAULT_LIQUID_PRESETS } from "@/lib/constants";

describe("liquidPresets CRUD", () => {
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  it("initial state liquidPresets equals DEFAULT_LIQUID_PRESETS (8 presets)", () => {
    const { liquidPresets } = useSettingsStore.getState();
    expect(liquidPresets).toEqual(DEFAULT_LIQUID_PRESETS);
    expect(liquidPresets).toHaveLength(8);
  });

  it("addLiquidPreset adds a preset with auto-generated id", () => {
    const { addLiquidPreset } = useSettingsStore.getState();
    addLiquidPreset({
      name: "Cold Brew",
      type: "caffeine",
      substancePer100ml: 65,
      defaultVolumeMl: 350,
      isDefault: false,
      source: "manual",
    });

    const { liquidPresets } = useSettingsStore.getState();
    expect(liquidPresets).toHaveLength(9);
    const added = liquidPresets[liquidPresets.length - 1];
    expect(added.name).toBe("Cold Brew");
    expect(added.id).toBeTruthy();
    expect(added.id).not.toBe("");
    expect(added.substancePer100ml).toBe(65);
  });

  it("updateLiquidPreset updates the matching preset's fields by id", () => {
    const { updateLiquidPreset } = useSettingsStore.getState();
    updateLiquidPreset("default-espresso", { name: "Ristretto", substancePer100ml: 250 });

    const { liquidPresets } = useSettingsStore.getState();
    const updated = liquidPresets.find((p) => p.id === "default-espresso");
    expect(updated).toBeDefined();
    expect(updated!.name).toBe("Ristretto");
    expect(updated!.substancePer100ml).toBe(250);
    // Other fields unchanged
    expect(updated!.defaultVolumeMl).toBe(30);
    expect(updated!.type).toBe("caffeine");
  });

  it("deleteLiquidPreset removes the preset by id", () => {
    const { deleteLiquidPreset } = useSettingsStore.getState();
    deleteLiquidPreset("default-espresso");

    const { liquidPresets } = useSettingsStore.getState();
    expect(liquidPresets).toHaveLength(7);
    expect(liquidPresets.find((p) => p.id === "default-espresso")).toBeUndefined();
  });

  it("addLiquidPreset with duplicate name still adds (no uniqueness constraint)", () => {
    const { addLiquidPreset } = useSettingsStore.getState();
    addLiquidPreset({
      name: "Espresso",
      type: "caffeine",
      substancePer100ml: 200,
      defaultVolumeMl: 30,
      isDefault: false,
      source: "manual",
    });

    const { liquidPresets } = useSettingsStore.getState();
    const espressos = liquidPresets.filter((p) => p.name === "Espresso");
    expect(espressos).toHaveLength(2);
  });

  it("deleteLiquidPreset with non-existent id is a no-op", () => {
    const { deleteLiquidPreset } = useSettingsStore.getState();
    deleteLiquidPreset("non-existent-id");

    const { liquidPresets } = useSettingsStore.getState();
    expect(liquidPresets).toHaveLength(8);
  });

  it("updateLiquidPreset with non-existent id is a no-op", () => {
    const { updateLiquidPreset } = useSettingsStore.getState();
    updateLiquidPreset("non-existent-id", { name: "Ghost" });

    const { liquidPresets } = useSettingsStore.getState();
    expect(liquidPresets).toHaveLength(8);
    expect(liquidPresets.find((p) => p.name === "Ghost")).toBeUndefined();
  });
});
