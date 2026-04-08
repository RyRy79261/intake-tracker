"use client";

import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-guard";
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
  mechanismOfAction?: string;
  visualIdentification?: string;
  contraindications: string[];
  warnings: string[];
  isGenericFallback: boolean;
}

export function useMedicineSearch() {
  const { getAuthHeader } = useAuth();

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

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const authHeader = await getAuthHeader();
      if (authHeader.Authorization) {
        headers.Authorization = authHeader.Authorization;
      }

      const response = await fetch("/api/ai/medicine-search", {
        method: "POST",
        headers,
        body: JSON.stringify({
          query,
          country: countryContext,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to search medication");
      }

      return response.json();
    },
  });
}
