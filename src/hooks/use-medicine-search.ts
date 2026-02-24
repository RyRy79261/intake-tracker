"use client";

import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-guard";
import { usePerplexityKey } from "@/hooks/use-settings";
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

export function useMedicineSearch() {
  const { getAuthHeader } = useAuth();
  const { getApiKey } = usePerplexityKey();

  return useMutation({
    mutationFn: async (query: string): Promise<MedicineSearchResult> => {
      const country = useSettingsStore.getState().userCountry;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const authHeader = await getAuthHeader();
      if (authHeader.Authorization) {
        headers.Authorization = authHeader.Authorization;
      }

      const clientApiKey = getApiKey();

      const response = await fetch("/api/ai/medicine-search", {
        method: "POST",
        headers,
        body: JSON.stringify({
          query,
          clientApiKey: clientApiKey || undefined,
          country: country && country !== "none" ? country : undefined,
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
