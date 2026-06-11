import { describe, it, expect, beforeEach } from "vitest";
import {
  useSettingsStore,
  migrateSettings,
  SETTINGS_PERSIST_VERSION,
} from "@/stores/settings-store";

describe("optionalTrackers settings", () => {
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  describe("defaults", () => {
    it("sugar defaults to enabled (preserves existing UX)", () => {
      const { optionalTrackers } = useSettingsStore.getState();
      expect(optionalTrackers.sugar).toBe(true);
    });

    it("potassium defaults to disabled (opt-in)", () => {
      const { optionalTrackers } = useSettingsStore.getState();
      expect(optionalTrackers.potassium).toBe(false);
    });
  });

  describe("setOptionalTracker", () => {
    it("enables a tracker without mutating siblings", () => {
      const { setOptionalTracker } = useSettingsStore.getState();
      setOptionalTracker("potassium", true);
      const { optionalTrackers } = useSettingsStore.getState();
      expect(optionalTrackers.potassium).toBe(true);
      expect(optionalTrackers.sugar).toBe(true);
    });

    it("disables a tracker without mutating siblings", () => {
      const { setOptionalTracker } = useSettingsStore.getState();
      setOptionalTracker("sugar", false);
      const { optionalTrackers } = useSettingsStore.getState();
      expect(optionalTrackers.sugar).toBe(false);
      expect(optionalTrackers.potassium).toBe(false);
    });

    it("is idempotent — re-applying the same value is a no-op", () => {
      const { setOptionalTracker } = useSettingsStore.getState();
      setOptionalTracker("sugar", true);
      setOptionalTracker("sugar", true);
      expect(useSettingsStore.getState().optionalTrackers.sugar).toBe(true);
    });

    it("creates a new optionalTrackers object on each set (immutability)", () => {
      const { setOptionalTracker } = useSettingsStore.getState();
      const before = useSettingsStore.getState().optionalTrackers;
      setOptionalTracker("potassium", true);
      const after = useSettingsStore.getState().optionalTrackers;
      expect(after).not.toBe(before);
      expect(before.potassium).toBe(false); // snapshot wasn't mutated
    });
  });

  describe("resetToDefaults", () => {
    it("restores both trackers to their defaults", () => {
      const { setOptionalTracker, resetToDefaults } = useSettingsStore.getState();
      setOptionalTracker("sugar", false);
      setOptionalTracker("potassium", true);
      resetToDefaults();
      const { optionalTrackers } = useSettingsStore.getState();
      expect(optionalTrackers).toEqual({ sugar: true, potassium: false });
    });
  });

  describe("persisted-state migration", () => {
    it("constant matches the version migrate brings state up to", () => {
      expect(SETTINGS_PERSIST_VERSION).toBe(16);
    });

    it("upgrading from v14 seeds optionalTrackers with the documented defaults", () => {
      // v14 state — has sugarLimit/potassiumLimit but no optionalTrackers
      // (this is what every existing user on the previous build had).
      const v14State = {
        sugarLimit: 30,
        potassiumLimit: 3500,
      };
      const migrated = migrateSettings(v14State, 14) as unknown as Record<
        string,
        unknown
      >;
      expect(migrated.optionalTrackers).toEqual({
        sugar: true,
        potassium: false,
      });
    });

    it("upgrading from a much older version still ends up at the documented defaults", () => {
      // Worst case: very old state with stale keys. We just need to make
      // sure optionalTrackers ends up present and correct.
      const ancient = {
        perplexityApiKey: "leaked-secret",
        coffeeDefaultType: "Espresso",
        liquidPresets: [],
        sugarLimit: 25,
      };
      const migrated = migrateSettings(ancient, 0) as unknown as Record<
        string,
        unknown
      >;
      expect(migrated.optionalTrackers).toEqual({
        sugar: true,
        potassium: false,
      });
      // Old keys that were explicitly dropped should also be gone.
      expect("perplexityApiKey" in migrated).toBe(false);
      expect("coffeeDefaultType" in migrated).toBe(false);
    });

    it("re-running migrate on already-current state leaves the optional-tracker choice intact", () => {
      const current = {
        optionalTrackers: { sugar: false, potassium: true },
        waterExtendedBuffer: 750,
      };
      const migrated = migrateSettings(
        current,
        SETTINGS_PERSIST_VERSION,
      ) as unknown as Record<string, unknown>;
      // No older branches should run, so the explicit user choices survive.
      expect(migrated.optionalTrackers).toEqual({
        sugar: false,
        potassium: true,
      });
      expect(migrated.waterExtendedBuffer).toBe(750);
    });

    it("upgrading from v15 seeds the extended-buffer defaults", () => {
      const v15State = {
        sugarLimit: 30,
        potassiumLimit: 3500,
        optionalTrackers: { sugar: true, potassium: false },
      };
      const migrated = migrateSettings(v15State, 15) as unknown as Record<
        string,
        unknown
      >;
      expect(migrated.waterExtendedBuffer).toBe(500);
      expect(migrated.saltExtendedBuffer).toBe(500);
      expect(migrated.sugarExtendedBuffer).toBe(10);
    });
  });
});
