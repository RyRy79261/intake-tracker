"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import { useSettingsStore } from "@/stores/settings-store";

export interface MedicineStrengthOption {
  label: string;
  compounds: { name: string; strength: number }[];
}

export interface MedicineSearchResult {
  brandNames: string[];
  localAlternatives: string[];
  genericName: string;
  dosageStrengths: string[];
  /** Active ingredient names — length ≥ 2 marks a combination drug. */
  activeIngredients: string[];
  /** Per-marketed-strength breakdown of each active ingredient's mg. */
  strengthOptions: MedicineStrengthOption[];
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

/** A non-2xx reply from the search route, with its status and error code. */
export class MedicineSearchError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "MedicineSearchError";
    this.status = status;
    this.code = code;
  }
}

export interface MedicineSearchVariables {
  query: string;
  /** Aborting it rejects with MedicineSearchCancelledError. */
  signal?: AbortSignal;
}

/** The region hint sent with every lookup, from the Medications settings. */
export function regionContext(): string | undefined {
  const state = useSettingsStore.getState();
  const primary = state.primaryRegion;
  const secondary = state.secondaryRegion;
  if (!primary || primary === "none") return undefined;
  let country = primary;
  if (secondary && secondary !== "None" && secondary !== "none") {
    country += ` (and ${secondary} as secondary fallback)`;
  }
  return country;
}

/** POST /api/ai/medicine-search. Cancellable through `signal`. */
export async function searchMedicine({
  query,
  signal,
}: MedicineSearchVariables): Promise<MedicineSearchResult> {
  let response: Response;
  try {
    response = await apiFetch("/api/ai/medicine-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, country: regionContext() }),
      ...(signal && { signal }),
    });
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
      throw new MedicineSearchCancelledError();
    }
    throw err;
  }

  if (!response) {
    throw new MedicineSearchCancelledError();
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new MedicineSearchError(
      data.error || "Failed to search medication",
      response.status,
      data.code,
    );
  }

  return response.json();
}

export function useMedicineSearch() {
  return useMutation({
    mutationFn: (input: string | MedicineSearchVariables): Promise<MedicineSearchResult> =>
      searchMedicine(typeof input === "string" ? { query: input } : input),
  });
}
