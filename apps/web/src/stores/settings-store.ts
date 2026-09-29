import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { sanitizeNumericInput } from "@/lib/security";
import {
  DEFAULT_LIQUID_PRESETS,
  type LiquidPreset,
  type LiquidPresetPatch,
} from "@/lib/constants";
import { DEFAULT_QUICK_NAV_ITEMS, type QuickNavItem } from "@/lib/quick-nav-defaults";
import { DEFAULT_WEEK_STARTS_ON, isWeekStartsOn } from "@/lib/week-start";

export type { LiquidPreset } from "@/lib/constants";
export type { QuickNavItem } from "@/lib/quick-nav-defaults";

/**
 * All settings, persisted to this device's localStorage. The ones that
 * describe the user (limits, buffers, optional trackers, day start, week
 * start, liquid
 * presets, regions, reminder follow-ups, home timezone) are also mirrored to
 * the synced `userSettings` table by lib/settings-sync.ts
 * (SYNCED_SETTING_KEYS); the rest are device-only preferences.
 */
export interface Settings {
  // Increment value for the water +/- buttons
  waterIncrement: number; // ml

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

  // Extended buffers added on top of the daily limit. Progress bars render a
  // second-tone segment from `limit` up to `limit + extendedBuffer` before
  // turning red. 0 disables the second stage.
  waterExtendedBuffer: number; // ml
  saltExtendedBuffer: number; // mg
  sugarExtendedBuffer: number; // g

  // Day start hour for budget tracking (0-23, default 2 = 2am)
  // Records after this hour count toward "today's" budget
  dayStartHour: number;

  // First day of every displayed week (0-6, JS getDay numbering; default
  // 1 = Monday). Display order only: stored daysOfWeek stay Sunday-indexed.
  weekStartsOn: number;

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

  // Liquid presets (beverage CRUD)
  liquidPresets: LiquidPreset[];

  // Whether the one-time analytics intro dialog has been shown
  analyticsIntroSeen: boolean;

  // Medication region settings
  primaryRegion: string;
  secondaryRegion: string;

  // Clock format for displayed times (read by formatTimeOnly/formatDateTime)
  timeFormat: "12h" | "24h";

  // Dose reminder settings
  doseRemindersEnabled: boolean;
  reminderFollowUpCount: number;
  reminderFollowUpInterval: number; // minutes

  // Weight increment for +/- buttons (kg)
  weightIncrement: number;

  // Storage mode: local-only or cloud-sync
  storageMode: "local" | "cloud-sync";

  // IANA zone the user's dose schedules belong to ("home"), synced across
  // devices. null until the user first confirms it (the travel prompt's
  // Adjust, or the timezone check finding every schedule anchored here).
  // A device whose zone differs from it is away from home.
  homeTimezone: string | null;
  homeTimezoneConfirmedAt: number | null;

  // Shake the device to open the bug report / feature request dialog
  shakeToReportEnabled: boolean;
  shakeThreshold: number; // acceleration-magnitude jolt delta (m/s²) — lower = more sensitive
  shakeRequiredJolts: number; // jolts within the detection window required to fire

  // Ward Console shell (sys-bar + bottom bar) instead of the legacy header,
  // swipe nav and floating bars. Staged rollout: device-only, on by default
  // (a stored value wins, so the Settings > Debug switch can turn it off).
  // Never synced.
  wardShell: boolean;

  // Display preferences (Settings > Appearance). Device-only, never synced.
  // Bigger text scales the root font size; Reduce motion turns animations
  // and transitions off (see components/display-prefs.tsx).
  bigText: boolean;
  reduceMotion: boolean;
}

interface SettingsActions {
  setWaterIncrement: (value: number) => void;
  setWaterLimit: (value: number) => void;
  setSaltLimit: (value: number) => void;
  setSugarLimit: (value: number) => void;
  setWaterExtendedBuffer: (value: number) => void;
  setSaltExtendedBuffer: (value: number) => void;
  setSugarExtendedBuffer: (value: number) => void;
  setPotassiumLimit: (value: number) => void;
  setOptionalTracker: (key: "sugar" | "potassium", enabled: boolean) => void;
  setDayStartHour: (hour: number) => void;
  setWeekStartsOn: (day: number) => void;
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
  addLiquidPreset: (preset: Omit<LiquidPreset, "id">) => string;
  updateLiquidPreset: (id: string, updates: LiquidPresetPatch) => void;
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
  // Home timezone (synced)
  setHomeTimezone: (timezone: string) => void;
  // Shake to report
  setShakeToReportEnabled: (value: boolean) => void;
  setShakeThreshold: (value: number) => void;
  setShakeRequiredJolts: (value: number) => void;
  // Ward Console shell (staged rollout, device-only)
  setWardShell: (value: boolean) => void;
  // Display preferences (device-only)
  setBigText: (value: boolean) => void;
  setReduceMotion: (value: boolean) => void;
  /**
   * Restore preferences to their defaults. Leaves alone the fields that are
   * data or have their own flows (see RESET_PRESERVED_KEYS).
   */
  resetToDefaults: () => void;
}

const defaultSettings: Settings = {
  waterIncrement: 250,
  waterLimit: 1000,
  saltLimit: 1500,
  sugarLimit: 30,
  waterExtendedBuffer: 500,
  saltExtendedBuffer: 500,
  sugarExtendedBuffer: 10,
  potassiumLimit: 3500,
  optionalTrackers: {
    sugar: true,
    potassium: false,
  },
  dayStartHour: 2, // Default: 2am - day starts at 2am for budget tracking
  weekStartsOn: DEFAULT_WEEK_STARTS_ON, // Monday
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
  homeTimezone: null,
  homeTimezoneConfirmedAt: null,
  wardShell: true,
  bigText: false,
  reduceMotion: false,
};

/**
 * Schema-version number persisted alongside the settings JSON. Bump this and
 * extend `migrateSettings` whenever the `Settings` shape changes in a way
 * that would break an older stored state (new required field, dropped key,
 * renamed key, etc).
 */
export const SETTINGS_PERSIST_VERSION = 18;

/**
 * Fields "Reset to Defaults" must not touch:
 * - liquidPresets: user data; past entries tagged `preset:<id>` lose their
 *   name if a custom preset disappears.
 * - storageMode / doseRemindersEnabled: flipping the flag alone skips the
 *   sync switch and the push unsubscribe, leaving client and server out of
 *   step. Change them through their own controls.
 * - analyticsIntroSeen: a one-time onboarding flag, not a preference.
 * - homeTimezone(ConfirmedAt): where the dose schedules are anchored; it
 *   changes only together with the schedules (the travel prompt).
 */
const RESET_PRESERVED_KEYS = [
  "liquidPresets",
  "storageMode",
  "doseRemindersEnabled",
  "analyticsIntroSeen",
  "homeTimezone",
  "homeTimezoneConfirmedAt",
] as const satisfies ReadonlyArray<keyof Settings>;

/** Legacy region codes written by the old /settings region picker. */
function normalizeRegion(value: unknown): unknown {
  if (value === "UK") return "GB";
  if (value === "None" || value === "none" || value === "Other") return "";
  return value;
}

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
  if (version < 12 && state.shakeThreshold === 15) {
    // Installs stored at v11 hold 15 / 3; lower them to 8 as v12 did, so v17
    // below can move the whole 8 / 3 pair to the current 10 / 5 defaults.
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
  if (version < 16) {
    // Two-stage progress bars — seed defaults for the extended buffer
    // zone shown above the daily limit.
    state.waterExtendedBuffer = 500;
    state.saltExtendedBuffer = 500;
    state.sugarExtendedBuffer = 10;
  }
  if (version < 17) {
    // The shake defaults moved from 8 / 3 to 10 / 5 without a migration, so
    // no existing install picked them up. Move the untouched old pair only.
    if (state.shakeThreshold === 8 && state.shakeRequiredJolts === 3) {
      state.shakeThreshold = 10;
      state.shakeRequiredJolts = 5;
    }
    // The old /settings region picker stored "UK", "None" and "Other"; the
    // medication settings combobox (and the AI search) use ISO codes and ""
    // for "not specified".
    for (const key of ["primaryRegion", "secondaryRegion"]) {
      if (key in state) state[key] = normalizeRegion(state[key]);
    }
    // Settings nothing reads: the sodium +/- increment (no stepper uses it),
    // weight-graph overlay toggles (no such chart), substance presets, the
    // never-set AI auth secret, data retention, and the theme (next-themes
    // owns it).
    for (const key of [
      "saltIncrement",
      "weightGraphShowEating",
      "weightGraphShowUrination",
      "weightGraphShowDefecation",
      "weightGraphShowDrinking",
      "substanceConfig",
      "aiAuthSecret",
      "dataRetentionDays",
      "theme",
    ]) {
      delete state[key];
    }
  }
  if (version < 18) {
    // The week start became a setting. Installs saved before it get the
    // Monday default (what the app already showed).
    if (!isWeekStartsOn(state.weekStartsOn)) state.weekStartsOn = DEFAULT_WEEK_STARTS_ON;
  }
  return state as unknown as Settings & SettingsActions;
}

export const useSettingsStore = create<Settings & SettingsActions>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setWaterIncrement: (value) => 
        set({ waterIncrement: sanitizeNumericInput(value, 10, 1000) }),
      setWaterLimit: (value) => 
        set({ waterLimit: sanitizeNumericInput(value, 100, 10000) }),
      setSaltLimit: (value) =>
        set({ saltLimit: sanitizeNumericInput(value, 100, 10000) }),
      setSugarLimit: (value) =>
        set({ sugarLimit: sanitizeNumericInput(value, 5, 500) }),
      setWaterExtendedBuffer: (value) =>
        set({ waterExtendedBuffer: sanitizeNumericInput(value, 0, 10000) }),
      setSaltExtendedBuffer: (value) =>
        set({ saltExtendedBuffer: sanitizeNumericInput(value, 0, 10000) }),
      setSugarExtendedBuffer: (value) =>
        set({ sugarExtendedBuffer: sanitizeNumericInput(value, 0, 500) }),
      setPotassiumLimit: (value) =>
        set({ potassiumLimit: sanitizeNumericInput(value, 100, 20000) }),
      setOptionalTracker: (key, enabled) =>
        set((state) => ({
          optionalTrackers: { ...state.optionalTrackers, [key]: enabled },
        })),

      setDayStartHour: (hour) =>
        set({ dayStartHour: sanitizeNumericInput(hour, 0, 23) }),
      // Only a whole weekday 0-6; anything else is ignored.
      setWeekStartsOn: (day) => {
        if (isWeekStartsOn(day)) set({ weekStartsOn: day });
      },

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

      // Home timezone
      setHomeTimezone: (timezone) =>
        set({ homeTimezone: timezone, homeTimezoneConfirmedAt: Date.now() }),

      // Shake to report
      setShakeToReportEnabled: (value) => set({ shakeToReportEnabled: value }),
      setShakeThreshold: (value) =>
        set({ shakeThreshold: sanitizeNumericInput(value, 4, 20) }),
      setShakeRequiredJolts: (value) =>
        set({ shakeRequiredJolts: sanitizeNumericInput(value, 2, 8) }),

      setWardShell: (value) => set({ wardShell: value }),
      setBigText: (value) => set({ bigText: value }),
      setReduceMotion: (value) => set({ reduceMotion: value }),

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
          liquidPresets: state.liquidPresets.map((p) => {
            if (p.id !== id) return p;
            // A key present with `undefined` clears the field (the user
            // emptied that input). A plain spread would keep it as an own
            // `undefined` key rather than removing it.
            const next: Record<string, unknown> = { ...p };
            for (const [key, value] of Object.entries(updates)) {
              if (value === undefined) delete next[key];
              else next[key] = value;
            }
            return next as unknown as LiquidPreset;
          }),
        })),
      deleteLiquidPreset: (id) =>
        set((state) => ({
          liquidPresets: state.liquidPresets.filter((p) => p.id !== id),
        })),

      resetToDefaults: () => {
        // A partial set merges, so the preserved fields keep their values.
        const next: Partial<Settings> = { ...defaultSettings };
        for (const key of RESET_PRESERVED_KEYS) delete next[key];
        set(next);
      },
    }),
    {
      name: "intake-tracker-settings",
      storage: createJSONStorage(() => localStorage),
      version: SETTINGS_PERSIST_VERSION,
      migrate: (persisted, version) => migrateSettings(persisted, version),
    }
  )
);
