import { describe, it, expect, beforeEach } from "vitest";
import {
  useSettingsStore,
  migrateSettings,
  SETTINGS_PERSIST_VERSION,
} from "@/stores/settings-store";

/** The data fields of a fresh install (actions stripped). */
function freshDefaults(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(useSettingsStore.getInitialState()).filter(
      ([, v]) => typeof v !== "function",
    ),
  );
}

/** What zustand's persist ends up with: the migrated blob merged over the initial state. */
function hydrate(persisted: Record<string, unknown>, version: number) {
  const migrated = migrateSettings({ ...persisted }, version) as unknown as Record<
    string,
    unknown
  >;
  return { ...freshDefaults(), ...migrated };
}

const DEAD_KEYS = [
  "saltIncrement",
  "weightGraphShowEating",
  "weightGraphShowUrination",
  "weightGraphShowDefecation",
  "weightGraphShowDrinking",
  "substanceConfig",
  "aiAuthSecret",
  "dataRetentionDays",
  "theme",
];

describe("settings migrations", () => {
  it("constant matches the version migrate brings state up to", () => {
    expect(SETTINGS_PERSIST_VERSION).toBe(17);
  });

  // A user who never changed a setting must end up exactly where a fresh
  // install starts, whatever version they upgrade from.
  it.each(Array.from({ length: SETTINGS_PERSIST_VERSION }, (_, v) => v))(
    "an untouched install upgrading from v%i matches a fresh install",
    (version) => {
      expect(hydrate({}, version)).toEqual(freshDefaults());
    },
  );

  it("moves installs still on the old 8 / 3 shake defaults to the current 10 / 5", () => {
    const state = hydrate({ shakeThreshold: 8, shakeRequiredJolts: 3 }, 16);
    expect(state.shakeThreshold).toBe(10);
    expect(state.shakeRequiredJolts).toBe(5);
  });

  it("keeps a shake sensitivity the user chose", () => {
    const state = hydrate({ shakeThreshold: 12, shakeRequiredJolts: 4 }, 16);
    expect(state.shakeThreshold).toBe(12);
    expect(state.shakeRequiredJolts).toBe(4);
  });

  it("drops settings nothing reads", () => {
    const state = hydrate(
      {
        saltIncrement: 100,
        weightGraphShowEating: false,
        weightGraphShowUrination: false,
        weightGraphShowDefecation: true,
        weightGraphShowDrinking: false,
        substanceConfig: { caffeine: { enabled: true, types: [] } },
        aiAuthSecret: "",
        dataRetentionDays: 90,
        theme: "dark",
      },
      16,
    );
    for (const key of DEAD_KEYS) expect(key in state).toBe(false);
    for (const key of DEAD_KEYS) expect(key in freshDefaults()).toBe(false);
  });

  it.each([
    ["UK", "GB"],
    ["None", ""],
    ["none", ""],
    ["Other", ""],
    ["US", "US"],
    ["ZA", "ZA"],
    ["", ""],
  ])("normalises stored region %j to %j", (stored, expected) => {
    const state = hydrate({ primaryRegion: stored, secondaryRegion: stored }, 16);
    expect(state.primaryRegion).toBe(expected);
    expect(state.secondaryRegion).toBe(expected);
  });
});

describe("resetToDefaults", () => {
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  it("resets preferences but keeps presets, storage mode, reminders and seen-intro flags", () => {
    const s = useSettingsStore.getState();
    const presetId = s.addLiquidPreset({
      name: "Oat Latte",
      tab: "coffee",
      caffeinePer100ml: 40,
      waterContentPercent: 90,
      defaultVolumeMl: 300,
      isDefault: false,
      source: "manual",
    });
    s.setStorageMode("cloud-sync");
    s.setDoseRemindersEnabled(true);
    s.setAnalyticsIntroSeen(true);
    s.setWaterLimit(2500);
    s.setPrimaryRegion("GB");

    useSettingsStore.getState().resetToDefaults();

    const after = useSettingsStore.getState();
    expect(after.waterLimit).toBe(1000);
    expect(after.primaryRegion).toBe("");
    expect(after.liquidPresets.some((p) => p.id === presetId)).toBe(true);
    expect(after.storageMode).toBe("cloud-sync");
    expect(after.doseRemindersEnabled).toBe(true);
    expect(after.analyticsIntroSeen).toBe(true);
  });
});
