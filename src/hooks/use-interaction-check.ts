import { useState, useCallback, useRef } from "react";
import { getCached, setCache } from "@/lib/interaction-cache";
import { useUpdatePrescription } from "@/hooks/use-medication-queries";
import { useAuth } from "@/components/auth-guard";

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
  const abortRef = useRef<AbortController | null>(null);
  const { getAuthHeader } = useAuth();

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const check = useCallback(async (params: CheckParams) => {
    // For lookup mode, check cache first
    if (params.mode === "lookup") {
      const cached = getCached<InteractionResult>(params.substance);
      if (cached) {
        setData(cached);
        setError(null);
        setIsLoading(false);
        return cached;
      }
    }

    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    // 15-second timeout
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    setIsLoading(true);
    setError(null);
    setData(null);

    try {
      const authHeaders = await getAuthHeader();
      const response = await fetch("/api/ai/interaction-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
      if (params.mode === "lookup") {
        setCache(params.substance, result);
      }

      return result;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Interaction check timed out");
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }

      setIsLoading(false);
      return null;
    }
  }, [getAuthHeader]);

  return { check, data, isLoading, error, reset };
}

// --- useRefreshInteractions ---

export function useRefreshInteractions() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const updatePrescription = useUpdatePrescription();
  const { getAuthHeader } = useAuth();

  const refresh = useCallback(
    async (
      prescriptionId: string,
      genericName: string,
      activePrescriptions: ActivePrescription[]
    ) => {
      setIsRefreshing(true);

      try {
        const authHeaders = await getAuthHeader();
        const response = await fetch("/api/ai/interaction-check", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            mode: "conflict" as const,
            newMedication: genericName,
            activePrescriptions,
          }),
        });

        if (!response.ok) {
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
      } catch {
        setIsRefreshing(false);
        return null;
      }
    },
    [updatePrescription, getAuthHeader]
  );

  return { refresh, isRefreshing };
}
