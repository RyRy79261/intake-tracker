"use client";

import { useMutation } from "@tanstack/react-query";
import { useAiFetch } from "@/hooks/use-ai-fetch";
import { useSettingsStore } from "@/stores/settings-store";

export interface MedicineSearchResult {
  brandNames: string[];
  localAlternatives: string[];
  genericName: string;
  dosageStrengths: string[];
  commonIndications: string[];
  foodInstruction: "before" | "after" | "none";
  foodNote?: string;
  pillColor: string;
  pillShape: string;
  pillDescription: string;
  drugClass: string;
  visualIdentification?: string;
  contraindications: string[];
  warnings: string[];
  isGenericFallback: boolean;
}

export class MedicineSearchCancelledError extends Error {
  constructor() {
    super("Medicine search cancelled");
    this.name = "MedicineSearchCancelledError";
  }
}

export function useMedicineSearch() {
  const aiFetch = useAiFetch();

  return useMutation({
    mutationFn: async (query: string): Promise<MedicineSearchResult> => {
      const state = useSettingsStore.getState();
      const primary = state.primaryRegion;
      const secondary = state.secondaryRegion;

      let countryContext: string | undefined = undefined;
      if (primary && primary !== "none") {
        countryContext = primary;
        if (secondary && secondary !== "None" && secondary !== "none") {
          countryContext += ` (and ${secondary} as secondary fallback)`;
        }
      }

      const response = await aiFetch("/api/ai/medicine-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          country: countryContext,
        }),
      });

      if (!response) {
        throw new MedicineSearchCancelledError();
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to search medication");
      }

      return response.json();
    },
  });
}
