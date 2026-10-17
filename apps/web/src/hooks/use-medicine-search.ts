"use client";

import { useMutation } from "@tanstack/react-query";
import { aiClient, type AiError, type MedicineSearchResult } from "@/lib/ai-client";
import { useSettingsStore } from "@/stores/settings-store";

export type { MedicineSearchResult, MedicineStrengthOption } from "@/lib/ai-client";

export class MedicineSearchCancelledError extends Error {
  constructor() {
    super("Medicine search cancelled");
    this.name = "MedicineSearchCancelledError";
  }
}

/** A failed search, with the AI client's error (code, wording, manual fallback). */
export class MedicineSearchError extends Error {
  readonly code: AiError["code"];
  readonly error: AiError;
  constructor(error: AiError) {
    super(error.message);
    this.name = "MedicineSearchError";
    this.code = error.code;
    this.error = error;
  }
}

export interface MedicineSearchVariables {
  query: string;
  /** Aborting it rejects with MedicineSearchCancelledError. */
  signal?: AbortSignal;
  /** Client time limit; defaults to the route's (see ai-client). */
  timeoutMs?: number;
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
  timeoutMs,
}: MedicineSearchVariables): Promise<MedicineSearchResult> {
  const country = regionContext();
  const result = await aiClient.call(
    "/api/ai/medicine-search",
    { query, ...(country !== undefined && { country }) },
    { ...(signal && { signal }), ...(timeoutMs !== undefined && { timeoutMs }) },
  );
  if (result.ok) return result.data;
  if (result.error.code === "CANCELLED") throw new MedicineSearchCancelledError();
  throw new MedicineSearchError(result.error);
}

export function useMedicineSearch() {
  return useMutation({
    mutationFn: (input: string | MedicineSearchVariables): Promise<MedicineSearchResult> =>
      searchMedicine(typeof input === "string" ? { query: input } : input),
  });
}
