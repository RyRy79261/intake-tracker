import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  obfuscateApiKey,
  deobfuscateApiKey,
  sanitizeNumericInput
} from "@/lib/security";
import { DEFAULT_LIQUID_PRESETS, type LiquidPreset } from "@/lib/constants";

export type { LiquidPreset } from "@/lib/constants";

export interface Settings {
  // Increment values for +/- buttons
  waterIncrement: number; // ml
  saltIncrement: number; // mg

  // Daily limits
  waterLimit: number; // ml (default 1000ml = 1L)
  saltLimit: number; // mg (default 1500mg)

  // Perplexity API integration (stored obfuscated)
  // NOTE: Prefer server-side API key via PERPLEXITY_API_KEY env var
  perplexityApiKey: string;
  
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
  utilityOrder: "ai-right" | "food-right";

  // Animation timing settings (ms)
  scrollDurationMs: number;        // how fast page scrolls to section (100-1000)
  autoHideDelayMs: number;         // delay after scroll before header+footer hide (0-2000)
  barTransitionDurationMs: number; // header/footer slide in/out speed (50-500)

  // Tracking defaults
  urinationDefaultAmount: "small" | "medium" | "large";
  defecationDefaultAmount: "small" | "medium" | "large";
  coffeeDefaultType: string;

  // Weight graph defaults
  weightGraphShowEating: boolean;
  weightGraphShowUrination: boolean;
  weightGraphShowDefecation: boolean;
  weightGraphShowDrinking: boolean;

  // Liquid presets (beverage CRUD)
  liquidPresets: LiquidPreset[];
}

interface SettingsActions {
  setWaterIncrement: (value: number) => void;
  setSaltIncrement: (value: number) => void;
  setWaterLimit: (value: number) => void;
  setSaltLimit: (value: number) => void;
  setPerplexityApiKey: (key: string) => void;
  getDeobfuscatedApiKey: () => string;
  setAiAuthSecret: (secret: string) => void;
  getDeobfuscatedAuthSecret: () => string;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setDataRetentionDays: (days: number) => void;
  setDayStartHour: (hour: number) => void;
  setShowQuickNav: (value: boolean) => void;
  setQuickNavOrder: (order: "ltr" | "rtl") => void;
  setUtilityOrder: (order: "ai-right" | "food-right") => void;
  setScrollDurationMs: (value: number) => void;
  setAutoHideDelayMs: (value: number) => void;
  setBarTransitionDurationMs: (value: number) => void;
  setUrinationDefaultAmount: (value: "small" | "medium" | "large") => void;
  setDefecationDefaultAmount: (value: "small" | "medium" | "large") => void;
  setCoffeeDefaultType: (value: string) => void;
  setWeightGraphShowEating: (value: boolean) => void;
  setWeightGraphShowUrination: (value: boolean) => void;
  setWeightGraphShowDefecation: (value: boolean) => void;
  setWeightGraphShowDrinking: (value: boolean) => void;
  addLiquidPreset: (preset: Omit<LiquidPreset, "id">) => void;
  updateLiquidPreset: (id: string, updates: Partial<Omit<LiquidPreset, "id">>) => void;
  deleteLiquidPreset: (id: string) => void;
  resetToDefaults: () => void;
}

const defaultSettings: Settings = {
  waterIncrement: 250,
  saltIncrement: 250,
  waterLimit: 1000,
  saltLimit: 1500,
  perplexityApiKey: "",
  aiAuthSecret: "",
  theme: "system",
  dataRetentionDays: 90, // Default: keep 90 days of data
  dayStartHour: 2, // Default: 2am - day starts at 2am for budget tracking
  showQuickNav: true,
  quickNavOrder: "rtl" as const,
  utilityOrder: "ai-right" as const,
  scrollDurationMs: 300,
  autoHideDelayMs: 500,
  barTransitionDurationMs: 200,
  urinationDefaultAmount: "small" as const,
  defecationDefaultAmount: "medium" as const,
  coffeeDefaultType: "double-espresso",
  weightGraphShowEating: true,
  weightGraphShowUrination: true,
  weightGraphShowDefecation: true,
  weightGraphShowDrinking: true,
  liquidPresets: DEFAULT_LIQUID_PRESETS,
};

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
      
      // Store API key with obfuscation (NOT encryption - see security.ts)
      setPerplexityApiKey: (key) => 
        set({ perplexityApiKey: obfuscateApiKey(key) }),
      
      // Get the actual API key for use
      getDeobfuscatedApiKey: () => deobfuscateApiKey(get().perplexityApiKey),
      
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
      setUtilityOrder: (order) => set({ utilityOrder: order }),
      setScrollDurationMs: (value) =>
        set({ scrollDurationMs: sanitizeNumericInput(value, 100, 1000) }),
      setAutoHideDelayMs: (value) =>
        set({ autoHideDelayMs: sanitizeNumericInput(value, 0, 2000) }),
      setBarTransitionDurationMs: (value) =>
        set({ barTransitionDurationMs: sanitizeNumericInput(value, 50, 500) }),

      setUrinationDefaultAmount: (value) => set({ urinationDefaultAmount: value }),
      setDefecationDefaultAmount: (value) => set({ defecationDefaultAmount: value }),
      setCoffeeDefaultType: (value) => set({ coffeeDefaultType: value }),
      setWeightGraphShowEating: (value) => set({ weightGraphShowEating: value }),
      setWeightGraphShowUrination: (value) => set({ weightGraphShowUrination: value }),
      setWeightGraphShowDefecation: (value) => set({ weightGraphShowDefecation: value }),
      setWeightGraphShowDrinking: (value) => set({ weightGraphShowDrinking: value }),

      addLiquidPreset: (preset) =>
        set((state) => ({
          liquidPresets: [
            ...state.liquidPresets,
            { ...preset, id: crypto.randomUUID() },
          ],
        })),
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
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version === 0) {
          delete state.perplexityApiKey;
          delete state.aiAuthSecret;
        }
        if (version < 2) {
          state.liquidPresets = DEFAULT_LIQUID_PRESETS;
        }
        return state as unknown as Settings & SettingsActions;
      },
    }
  )
);
