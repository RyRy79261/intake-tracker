import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  obfuscateApiKey,
  deobfuscateApiKey,
  sanitizeNumericInput
} from "@/lib/security";
import { DEFAULT_LIQUID_PRESETS, type LiquidPreset } from "@/lib/constants";
import { DEFAULT_QUICK_NAV_ITEMS, type QuickNavItem } from "@/lib/quick-nav-defaults";

export type { LiquidPreset } from "@/lib/constants";
export type { QuickNavItem } from "@/lib/quick-nav-defaults";

export interface SubstanceConfig {
  caffeine: {
    enabled: boolean;
    types: Array<{ name: string; defaultMg: number; defaultVolumeMl: number }>;
  };
  alcohol: {
    enabled: boolean;
    types: Array<{ name: string; defaultDrinks: number; defaultVolumeMl: number }>;
  };
}

export interface Settings {
  // Increment values for +/- buttons
  waterIncrement: number; // ml
  saltIncrement: number; // mg

  // Daily limits
  waterLimit: number; // ml (default 1000ml = 1L)
  saltLimit: number; // mg (default 1500mg)
  sugarLimit: number; // g (default 30g total sugars)
  potassiumLimit: number; // mg (default 3500mg — WHO suggested adequate intake)

  // Optional / opt-in nutritional trackers. Each tracker maps to an
  // `IntakeRecord` type; when disabled the tracker is hidden from every
  // surface (forms, voice editor, progress bars, weekly grid, analytics,
  // history filter, AI snapshot) and new entries are not persisted.
  // Sugar defaults on (the field shipped enabled in v13); potassium
  // defaults off — opt-in, since the user has no firm target.
  optionalTrackers: {
    sugar: boolean;
    potassium: boolean;
  };

  // Secret to authenticate with server-side AI (if using server API key)
  // Set AI_AUTH_SECRET env var on server, enter same value here
  aiAuthSecret: string;

  // Theme preference
  theme: "light" | "dark" | "system";

  // Data retention (days, 0 = keep forever)
  dataRetentionDays: number;

  // Day start hour for budget tracking (0-23, default 2 = 2am)
  // Records after this hour count toward "today's" budget
  dayStartHour: number;

  // Quick Nav footer
  showQuickNav: boolean;
  quickNavOrder: "ltr" | "rtl";
  // Quick Nav configurable item list (order + enabled state per item)
  quickNavItems: QuickNavItem[];

  // Animation timing settings (ms)
  scrollDurationMs: number;        // how fast page scrolls to section (100-1000)
  autoHideDelayMs: number;         // delay after scroll before header+footer hide (0-2000)
  barTransitionDurationMs: number; // header/footer slide in/out speed (50-500)

  // Swipe navigation release thresholds
  swipeNavDistanceThresholdPct: number; // % of viewport width to commit (10-60)
  swipeNavVelocityThreshold: number;    // px/s flick velocity to commit (100-2000)

  // Tracking defaults
  urinationDefaultAmount: "small" | "medium" | "large";
  defecationDefaultAmount: "small" | "medium" | "large";
  // Weight graph defaults
  weightGraphShowEating: boolean;
  weightGraphShowUrination: boolean;
  weightGraphShowDefecation: boolean;
  weightGraphShowDrinking: boolean;

  // Liquid presets (beverage CRUD)
  liquidPresets: LiquidPreset[];

  // Whether the one-time analytics intro dialog has been shown
  analyticsIntroSeen: boolean;

  // Medication region settings
  primaryRegion: string;
  secondaryRegion: string;

  // Time format
  timeFormat: "12h" | "24h";

  // Dose reminder settings
  doseRemindersEnabled: boolean;
  reminderFollowUpCount: number;
  reminderFollowUpInterval: number; // minutes

  // Weight increment for +/- buttons (kg)
  weightIncrement: number;

  // Storage mode: local-only or cloud-sync
  storageMode: "local" | "cloud-sync";

  // Shake the device to open the bug report / feature request dialog
  shakeToReportEnabled: boolean;
  shakeThreshold: number; // acceleration-magnitude jolt delta (m/s²) — lower = more sensitive
  shakeRequiredJolts: number; // jolts within the detection window required to fire

  // Substance tracking configuration
  substanceConfig: SubstanceConfig;
}

interface SettingsActions {
  setWaterIncrement: (value: number) => void;
  setSaltIncrement: (value: number) => void;
  setWaterLimit: (value: number) => void;
  setSaltLimit: (value: number) => void;
  setSugarLimit: (value: number) => void;
  setPotassiumLimit: (value: number) => void;
  setOptionalTracker: (key: "sugar" | "potassium", enabled: boolean) => void;
  setAiAuthSecret: (secret: string) => void;
  getDeobfuscatedAuthSecret: () => string;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setDataRetentionDays: (days: number) => void;
  setDayStartHour: (hour: number) => void;
  setShowQuickNav: (value: boolean) => void;
  setQuickNavOrder: (order: "ltr" | "rtl") => void;
  setQuickNavItems: (items: QuickNavItem[]) => void;
  setScrollDurationMs: (value: number) => void;
  setAutoHideDelayMs: (value: number) => void;
  setBarTransitionDurationMs: (value: number) => void;
  setSwipeNavDistanceThresholdPct: (value: number) => void;
  setSwipeNavVelocityThreshold: (value: number) => void;
  setUrinationDefaultAmount: (value: "small" | "medium" | "large") => void;
  setDefecationDefaultAmount: (value: "small" | "medium" | "large") => void;
  setWeightGraphShowEating: (value: boolean) => void;
  setWeightGraphShowUrination: (value: boolean) => void;
  setWeightGraphShowDefecation: (value: boolean) => void;
  setWeightGraphShowDrinking: (value: boolean) => void;
  addLiquidPreset: (preset: Omit<LiquidPreset, "id">) => string;
  updateLiquidPreset: (id: string, updates: Partial<Omit<LiquidPreset, "id">>) => void;
  deleteLiquidPreset: (id: string) => void;
  // Analytics intro
  setAnalyticsIntroSeen: (seen: boolean) => void;
  // Medication region settings
  setPrimaryRegion: (value: string) => void;
  setSecondaryRegion: (value: string) => void;
  // Time format
  setTimeFormat: (format: "12h" | "24h") => void;
  // Dose reminders
  setDoseRemindersEnabled: (value: boolean) => void;
  setReminderFollowUpCount: (value: number) => void;
  setReminderFollowUpInterval: (value: number) => void;
  // Weight increment
  setWeightIncrement: (value: number) => void;
  // Storage mode
  setStorageMode: (mode: "local" | "cloud-sync") => void;
  // Shake to report
  setShakeToReportEnabled: (value: boolean) => void;
  setShakeThreshold: (value: number) => void;
  setShakeRequiredJolts: (value: number) => void;
  // Substance config
  setSubstanceConfig: (config: SubstanceConfig) => void;
  resetToDefaults: () => void;
}

const defaultSettings: Settings = {
  waterIncrement: 250,
  saltIncrement: 250,
  waterLimit: 1000,
  saltLimit: 1500,
  sugarLimit: 30,
  potassiumLimit: 3500,
  optionalTrackers: {
    sugar: true,
    potassium: false,
  },
  aiAuthSecret: "",
  theme: "system",
  dataRetentionDays: 90, // Default: keep 90 days of data
  dayStartHour: 2, // Default: 2am - day starts at 2am for budget tracking
  showQuickNav: true,
  quickNavOrder: "rtl" as const,
  quickNavItems: DEFAULT_QUICK_NAV_ITEMS,
  scrollDurationMs: 300,
  autoHideDelayMs: 500,
  barTransitionDurationMs: 200,
  swipeNavDistanceThresholdPct: 28,
  swipeNavVelocityThreshold: 500,
  urinationDefaultAmount: "small" as const,
  defecationDefaultAmount: "medium" as const,
  weightGraphShowEating: true,
  weightGraphShowUrination: true,
  weightGraphShowDefecation: true,
  weightGraphShowDrinking: true,
  liquidPresets: DEFAULT_LIQUID_PRESETS,
  weightIncrement: 0.05,
  storageMode: "local" as const,
  analyticsIntroSeen: false,
  shakeToReportEnabled: true,
  shakeThreshold: 10,
  shakeRequiredJolts: 5,
  primaryRegion: "",
  secondaryRegion: "",
  timeFormat: "24h" as const,
  doseRemindersEnabled: false,
  reminderFollowUpCount: 2,
  reminderFollowUpInterval: 10,
  substanceConfig: {
    caffeine: {
      enabled: true,
      types: [
        { name: "Coffee", defaultMg: 95, defaultVolumeMl: 250 },
        { name: "Espresso", defaultMg: 63, defaultVolumeMl: 30 },
        { name: "Tea", defaultMg: 47, defaultVolumeMl: 250 },
        { name: "Other", defaultMg: 80, defaultVolumeMl: 250 },
      ],
    },
    alcohol: {
      enabled: true,
      types: [
        { name: "Beer", defaultDrinks: 1, defaultVolumeMl: 330 },
        { name: "Wine", defaultDrinks: 1, defaultVolumeMl: 150 },
        { name: "Spirits", defaultDrinks: 1, defaultVolumeMl: 45 },
        { name: "Other", defaultDrinks: 1, defaultVolumeMl: 250 },
      ],
    },
  },
};

/**
 * Schema-version number persisted alongside the settings JSON. Bump this and
 * extend `migrateSettings` whenever the `Settings` shape changes in a way
 * that would break an older stored state (new required field, dropped key,
 * renamed key, etc).
 */
export const SETTINGS_PERSIST_VERSION = 15;

/**
 * Forward-migrate a persisted settings blob from any older version up to
 * `SETTINGS_PERSIST_VERSION`. Extracted from the zustand `persist` config
 * so it can be unit-tested in isolation — the actual migration callback
 * below simply delegates here.
 */
export function migrateSettings(
  persisted: unknown,
  version: number,
): Settings & SettingsActions {
  const state = persisted as Record<string, unknown>;
  if (version === 0) {
    delete state.perplexityApiKey;
    delete state.aiAuthSecret;
  }
  if (version < 2) {
    state.liquidPresets = DEFAULT_LIQUID_PRESETS;
  }
  if (version < 3) {
    delete state.coffeeDefaultType;
    delete state.utilityOrder;
    const presets = state.liquidPresets as Array<Record<string, unknown>>;
    if (Array.isArray(presets)) {
      state.liquidPresets = presets.map((p) => {
        if ("tab" in p) return p;
        const oldType = p.type as string;
        const oldPer100ml = p.substancePer100ml as number;
        const { type: _t, substancePer100ml: _s, ...rest } = p;
        return {
          ...rest,
          tab: oldType === "caffeine" ? "coffee" : "alcohol",
          waterContentPercent: 100,
          ...(oldType === "caffeine" && { caffeinePer100ml: oldPer100ml }),
          ...(oldType === "alcohol" && { alcoholPer100ml: oldPer100ml }),
        };
      });
    }
  }
  if (version < 5) {
    state.quickNavItems = DEFAULT_QUICK_NAV_ITEMS;
  }
  if (version < 7) {
    delete state.experimentalFeatures;
  }
  if (version < 8) {
    state.storageMode = "local";
  }
  if (version < 9) {
    state.swipeNavDistanceThresholdPct = 28;
    state.swipeNavVelocityThreshold = 500;
  }
  if (version < 10) {
    delete state.dismissedInsights;
    state.shakeToReportEnabled = true;
  }
  if (version < 11) {
    state.shakeThreshold = 15;
    state.shakeRequiredJolts = 3;
  }
  if (version < 12) {
    state.shakeThreshold = 8;
  }
  if (version < 13) {
    state.sugarLimit = 30;
  }
  if (version < 14) {
    state.potassiumLimit = 3500;
  }
  if (version < 15) {
    // Optional-trackers framework. Sugar shipped enabled in v13, so
    // preserve that for existing users; potassium defaults off
    // (opt-in) — the user has no firm target.
    state.optionalTrackers = { sugar: true, potassium: false };
  }
  return state as unknown as Settings & SettingsActions;
}

export const useSettingsStore = create<Settings & SettingsActions>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      setWaterIncrement: (value) => 
        set({ waterIncrement: sanitizeNumericInput(value, 10, 1000) }),
      setSaltIncrement: (value) => 
        set({ saltIncrement: sanitizeNumericInput(value, 10, 1000) }),
      setWaterLimit: (value) => 
        set({ waterLimit: sanitizeNumericInput(value, 100, 10000) }),
      setSaltLimit: (value) =>
        set({ saltLimit: sanitizeNumericInput(value, 100, 10000) }),
      setSugarLimit: (value) =>
        set({ sugarLimit: sanitizeNumericInput(value, 5, 500) }),
      setPotassiumLimit: (value) =>
        set({ potassiumLimit: sanitizeNumericInput(value, 100, 20000) }),
      setOptionalTracker: (key, enabled) =>
        set((state) => ({
          optionalTrackers: { ...state.optionalTrackers, [key]: enabled },
        })),
      
      // Store auth secret with obfuscation
      setAiAuthSecret: (secret) =>
        set({ aiAuthSecret: obfuscateApiKey(secret) }),
      
      // Get the actual auth secret for use
      getDeobfuscatedAuthSecret: () => deobfuscateApiKey(get().aiAuthSecret),
      
      setTheme: (theme) => set({ theme }),
      
      setDataRetentionDays: (days) => 
        set({ dataRetentionDays: sanitizeNumericInput(days, 0, 365) }),
      
      setDayStartHour: (hour) =>
        set({ dayStartHour: sanitizeNumericInput(hour, 0, 23) }),

      setShowQuickNav: (value) => set({ showQuickNav: value }),
      setQuickNavOrder: (order) => set({ quickNavOrder: order }),
      setQuickNavItems: (items) => set({ quickNavItems: items }),
      setScrollDurationMs: (value) =>
        set({ scrollDurationMs: sanitizeNumericInput(value, 100, 1000) }),
      setAutoHideDelayMs: (value) =>
        set({ autoHideDelayMs: sanitizeNumericInput(value, 0, 2000) }),
      setBarTransitionDurationMs: (value) =>
        set({ barTransitionDurationMs: sanitizeNumericInput(value, 50, 500) }),
      setSwipeNavDistanceThresholdPct: (value) =>
        set({ swipeNavDistanceThresholdPct: sanitizeNumericInput(value, 10, 60) }),
      setSwipeNavVelocityThreshold: (value) =>
        set({ swipeNavVelocityThreshold: sanitizeNumericInput(value, 100, 2000) }),

      setUrinationDefaultAmount: (value) => set({ urinationDefaultAmount: value }),
      setDefecationDefaultAmount: (value) => set({ defecationDefaultAmount: value }),
      setWeightGraphShowEating: (value) => set({ weightGraphShowEating: value }),
      setWeightGraphShowUrination: (value) => set({ weightGraphShowUrination: value }),
      setWeightGraphShowDefecation: (value) => set({ weightGraphShowDefecation: value }),
      setWeightGraphShowDrinking: (value) => set({ weightGraphShowDrinking: value }),

      // Analytics intro
      setAnalyticsIntroSeen: (seen) => set({ analyticsIntroSeen: seen }),

      // Medication region settings
      setPrimaryRegion: (value) => set({ primaryRegion: value }),
      setSecondaryRegion: (value) => set({ secondaryRegion: value }),

      // Time format
      setTimeFormat: (format) => set({ timeFormat: format }),

      // Dose reminders
      setDoseRemindersEnabled: (value) => set({ doseRemindersEnabled: value }),
      setReminderFollowUpCount: (value) => set({ reminderFollowUpCount: value }),
      setReminderFollowUpInterval: (value) => set({ reminderFollowUpInterval: value }),

      // Weight increment
      setWeightIncrement: (value) =>
        set({ weightIncrement: sanitizeNumericInput(value, 0.05, 1, 2) }),

      // Storage mode
      setStorageMode: (mode) => set({ storageMode: mode }),

      // Shake to report
      setShakeToReportEnabled: (value) => set({ shakeToReportEnabled: value }),
      setShakeThreshold: (value) =>
        set({ shakeThreshold: sanitizeNumericInput(value, 4, 20) }),
      setShakeRequiredJolts: (value) =>
        set({ shakeRequiredJolts: sanitizeNumericInput(value, 2, 8) }),

      // Substance config
      setSubstanceConfig: (config) => set({ substanceConfig: config }),

      addLiquidPreset: (preset) => {
        const id = crypto.randomUUID();
        set((state) => ({
          liquidPresets: [
            ...state.liquidPresets,
            { ...preset, id },
          ],
        }));
        return id;
      },
      updateLiquidPreset: (id, updates) =>
        set((state) => ({
          liquidPresets: state.liquidPresets.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),
      deleteLiquidPreset: (id) =>
        set((state) => ({
          liquidPresets: state.liquidPresets.filter((p) => p.id !== id),
        })),

      resetToDefaults: () => set(defaultSettings),
    }),
    {
      name: "intake-tracker-settings",
      storage: createJSONStorage(() => localStorage),
      version: SETTINGS_PERSIST_VERSION,
      migrate: (persisted, version) => migrateSettings(persisted, version),
    }
  )
);
