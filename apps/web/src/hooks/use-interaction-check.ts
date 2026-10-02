import { useState, useCallback, useRef, useSyncExternalStore } from "react";
import { createKeyedTaskStore } from "@/lib/keyed-task-store";
import { apiFetch } from "@/lib/api-fetch";
import {
  getCachedEntry,
  setCache,
  interactionCacheKey,
} from "@/lib/interaction-cache";
import { readAiErrorMessage } from "@/lib/ai-error-message";
import { useUpdatePrescription } from "@/hooks/use-medication-queries";
import { buildInteractionCheck, legacyInteractionFields } from "@/lib/medicine-about";

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

/**
 * Client-side ceiling for one interaction check: the route's maxDuration
 * (60 s). Its own deadline (50 s) returns a JSON 504 before this fires.
 */
const INTERACTION_CHECK_TIMEOUT_MS = 60_000;

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

    // Armed before the request, so it covers the whole round trip: a timer
    // started only once headers arrived never fired for a request the server
    // did not answer. The route answers a slow model with a JSON 504 at its
    // own 50 s deadline, so this only catches a request that got no answer.
    const timeoutId = setTimeout(() => controller.abort(), INTERACTION_CHECK_TIMEOUT_MS);

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
      clearTimeout(timeoutId);
    }
  }, []);

  return { check, data, isLoading, error, cachedAt, reset };
}

// --- useRefreshInteractions ---

const MSG_OFFLINE = "You are offline. Connect to the internet and try again.";
const MSG_TIMEOUT = "The check took too long and stopped. Try again.";

interface RefreshState {
  isRefreshing: boolean;
  error: string | null;
}
const REFRESH_IDLE: RefreshState = { isRefreshing: false, error: null };

/**
 * Checks by prescription id. Held outside the view, like the "About this
 * medicine" lookup: leaving the view must not throw a running check away.
 */
const refreshes = createKeyedTaskStore<RefreshState>(REFRESH_IDLE);

/** Stop every check and forget their state (tests). */
export const resetInteractionRefreshes = () => refreshes.reset();

/**
 * Check one prescription against the user's other active prescriptions and
 * store the answer on it: the structured `interactionCheck` (severity rows,
 * checked date, the medicine list it covered, the name it was made for) plus
 * the legacy flat `contraindications` / `warnings` strings older builds
 * still read. The check keeps running, and is still stored, when the view
 * that started it closes; `prescriptionId` picks the state to show.
 */
export function useRefreshInteractions(prescriptionId: string) {
  const { isRefreshing, error } = useSyncExternalStore(
    refreshes.subscribe,
    () => refreshes.get(prescriptionId),
    () => REFRESH_IDLE,
  );
  const updatePrescription = useUpdatePrescription();

  const refresh = useCallback(
    async (genericName: string, activePrescriptions: ActivePrescription[]) => {
      const set = (patch: Partial<RefreshState>) => refreshes.set(prescriptionId, patch);
      refreshes.controllers.get(prescriptionId)?.abort();
      refreshes.controllers.delete(prescriptionId);
      set({ error: null });
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        set({ error: MSG_OFFLINE });
        return null;
      }
      const controller = new AbortController();
      refreshes.controllers.set(prescriptionId, controller);
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, INTERACTION_CHECK_TIMEOUT_MS);
      set({ isRefreshing: true });

      try {
        const response = await apiFetch("/api/ai/interaction-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "conflict" as const,
            newMedication: genericName,
            activePrescriptions,
          }),
          signal: controller.signal,
        });

        if (!response) {
          // User dismissed sign-in
          set({ isRefreshing: false });
          return null;
        }
        if (!response.ok) {
          const msg =
            response.status === 504
              ? MSG_TIMEOUT
              : await readAiErrorMessage(
                  response,
                  `Interaction check failed (${response.status})`,
                );
          set({ error: msg, isRefreshing: false });
          return null;
        }

        const result: InteractionResult = await response.json();
        const interactionCheck = buildInteractionCheck(
          result,
          activePrescriptions.map((p) => p.genericName),
          Date.now(),
          // The name this check is for, so a later rename shows.
          genericName,
        );

        await updatePrescription.mutateAsync({
          id: prescriptionId,
          updates: { interactionCheck, ...legacyInteractionFields(result) },
        });

        set({ isRefreshing: false });
        return result;
      } catch (err) {
        if (controller.signal.aborted) {
          // Superseded by a newer check: say nothing, it owns the state now.
          // A timeout says so.
          if (timedOut) set({ error: MSG_TIMEOUT, isRefreshing: false });
          return null;
        }
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          set({ error: MSG_OFFLINE, isRefreshing: false });
        } else {
          set({
            error: err instanceof Error ? err.message : "Interaction check failed",
            isRefreshing: false,
          });
        }
        return null;
      } finally {
        clearTimeout(timeoutId);
        if (refreshes.controllers.get(prescriptionId) === controller) {
          refreshes.controllers.delete(prescriptionId);
        }
      }
    },
    [prescriptionId, updatePrescription]
  );

  return { refresh, isRefreshing, error };
}
