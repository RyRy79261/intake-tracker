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
      tab: "coffee",
      caffeinePer100ml: 65,
      waterContentPercent: 99,
      defaultVolumeMl: 350,
      isDefault: false,
      source: "manual",
    });

    const { liquidPresets } = useSettingsStore.getState();
    expect(liquidPresets).toHaveLength(9);
    const added = liquidPresets[liquidPresets.length - 1]!;
    expect(added.name).toBe("Cold Brew");
    expect(added.id).toBeTruthy();
    expect(added.id).not.toBe("");
    expect(added.caffeinePer100ml).toBe(65);
  });

  it("updateLiquidPreset updates the matching preset's fields by id", () => {
    const { updateLiquidPreset } = useSettingsStore.getState();
    updateLiquidPreset("default-espresso", { name: "Ristretto", caffeinePer100ml: 250 });

    const { liquidPresets } = useSettingsStore.getState();
    const updated = liquidPresets.find((p) => p.id === "default-espresso");
    expect(updated).toBeDefined();
    expect(updated!.name).toBe("Ristretto");
    expect(updated!.caffeinePer100ml).toBe(250);
    // Other fields unchanged
    expect(updated!.defaultVolumeMl).toBe(30);
    expect(updated!.tab).toBe("coffee");
  });

  it("updateLiquidPreset clears a field passed explicitly as undefined", () => {
    const { addLiquidPreset, updateLiquidPreset } = useSettingsStore.getState();
    addLiquidPreset({
      name: "Cola",
      tab: "beverage",
      waterContentPercent: 90,
      defaultVolumeMl: 330,
      sugarPer100ml: 10.6,
      potassiumPer100ml: 2,
      isDefault: false,
      source: "ai",
    });
    const added = useSettingsStore.getState().liquidPresets.at(-1)!;

    updateLiquidPreset(added.id, { sugarPer100ml: undefined, name: "Cola Zero" });

    const updated = useSettingsStore
      .getState()
      .liquidPresets.find((p) => p.id === added.id)!;
    // A spread would leave `sugarPer100ml: undefined` behind as an own key —
    // the clear must actually remove it.
    expect("sugarPer100ml" in updated).toBe(false);
    expect(updated.name).toBe("Cola Zero");
    // Keys absent from the patch are untouched.
    expect(updated.potassiumPer100ml).toBe(2);
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
      tab: "coffee",
      caffeinePer100ml: 200,
      waterContentPercent: 98,
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
