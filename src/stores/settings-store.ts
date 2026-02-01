import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { 
  obfuscateApiKey, 
  deobfuscateApiKey, 
  sanitizeNumericInput 
} from "@/lib/security";

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
  
  // Storage mode: "local" uses IndexedDB, "server" uses Neon Postgres
  storageMode: "local" | "server";
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
  setStorageMode: (mode: "local" | "server") => void;
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
  storageMode: "local", // Default: use local IndexedDB storage
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
      
      setStorageMode: (mode) => set({ storageMode: mode }),

      resetToDefaults: () => set(defaultSettings),
    }),
    {
      name: "intake-tracker-settings",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
