import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InsightsResult } from "@/hooks/use-insights";

/**
 * Caches the most recent AI insights result in localStorage so it survives
 * tab switches and reloads — reopening analytics shows the last summary
 * without re-spending tokens.
 */
interface InsightsState {
  lastResult: InsightsResult | null;
  setResult: (result: InsightsResult) => void;
  clear: () => void;
}

export const useInsightsStore = create<InsightsState>()(
  persist(
    (set) => ({
      lastResult: null,
      setResult: (result) => set({ lastResult: result }),
      clear: () => set({ lastResult: null }),
    }),
    { name: "intake-tracker-insights" },
  ),
);
