import { useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api-fetch";
import {
  getCachedEntry,
  setCache,
  interactionCacheKey,
} from "@/lib/interaction-cache";
import { readAiErrorMessage } from "@/lib/ai-error-message";
import { useUpdatePrescription } from "@/hooks/use-medication-queries";

// --- Types ---

export interface InteractionItem {
  substance: string;
  medication: string;
  severity: "AVOID" | "CAUTION" | "OK";
  description: string;
}

export interface InteractionResult {
  interactions: InteractionItem[];
  drugClass?: string;
  summary?: string;
}

interface ActivePrescription {
  genericName: string;
  drugClass?: string;
}

type CheckParams =
  | {
      mode: "conflict";
      newMedication: string;
      activePrescriptions: ActivePrescription[];
    }
  | {
      mode: "lookup";
      substance: string;
      activePrescriptions: ActivePrescription[];
    };

// --- useInteractionCheck ---

export function useInteractionCheck() {
  const [data, setData] = useState<InteractionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When `data` came from the lookup cache, when it was fetched — shown so a
  // day-old answer is never mistaken for a fresh one.
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setCachedAt(null);
    setIsLoading(false);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const check = useCallback(async (params: CheckParams) => {
    // For lookup mode, check cache first. The key covers the active
    // prescriptions, so a changed medication list always refetches.
    const cacheKey =
      params.mode === "lookup"
        ? interactionCacheKey(
            params.substance,
            params.activePrescriptions.map((rx) => rx.genericName),
          )
        : null;
    if (cacheKey) {
      const cached = getCachedEntry<InteractionResult>(cacheKey);
      if (cached) {
        setData(cached.data);
        setCachedAt(cached.timestamp);
        setError(null);
        setIsLoading(false);
        return cached.data;
      }
    }

    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    // The 15s abort timer must not start while the sign-in modal is open;
    // arm it only once aiFetch resolves with an actual Response.
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    setIsLoading(true);
    setError(null);
    setData(null);
    setCachedAt(null);

    try {
      const response = await apiFetch("/api/ai/interaction-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response) {
        // User dismissed sign-in
        setIsLoading(false);
        return null;
      }

      timeoutId = setTimeout(() => controller.abort(), 15000);

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const msg = body.error ?? `Request failed (${response.status})`;
        setError(msg);
        setIsLoading(false);
        return null;
      }

      const result: InteractionResult = await response.json();
      setData(result);
      setIsLoading(false);

      // Cache lookup results
      if (cacheKey) {
        setCache(cacheKey, result);
      }

      return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Interaction check timed out");
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }

      setIsLoading(false);
      return null;
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  }, []);

  return { check, data, isLoading, error, cachedAt, reset };
}

// --- useRefreshInteractions ---

export function useRefreshInteractions() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updatePrescription = useUpdatePrescription();

  const refresh = useCallback(
    async (
      prescriptionId: string,
      genericName: string,
      activePrescriptions: ActivePrescription[]
    ) => {
      setIsRefreshing(true);
      setError(null);

      try {
        const response = await apiFetch("/api/ai/interaction-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "conflict" as const,
            newMedication: genericName,
            activePrescriptions,
          }),
        });

        if (!response) {
          // User dismissed sign-in
          setIsRefreshing(false);
          return null;
        }
        if (!response.ok) {
          setError(
            await readAiErrorMessage(
              response,
              `Interaction check failed (${response.status})`,
            ),
          );
          setIsRefreshing(false);
          return null;
        }

        const result: InteractionResult = await response.json();

        // Map interactions to prescription fields
        const contraindications = result.interactions
          .filter((i) => i.severity === "AVOID")
          .map((i) => `${i.medication}: ${i.description}`);

        const warnings = result.interactions
          .filter((i) => i.severity === "CAUTION")
          .map((i) => `${i.medication}: ${i.description}`);

        // Prepend drug class to warnings if available
        if (result.drugClass) {
          warnings.unshift(`Drug class: ${result.drugClass}`);
        }

        // Persist to prescription
        await updatePrescription.mutateAsync({
          id: prescriptionId,
          updates: {
            contraindications,
            warnings,
          },
        });

        setIsRefreshing(false);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Interaction check failed");
        setIsRefreshing(false);
        return null;
      }
    },
    [updatePrescription]
  );

  return { refresh, isRefreshing, error };
}
