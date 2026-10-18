import { useState, useCallback, useRef, useSyncExternalStore } from "react";
import { createKeyedTaskStore } from "@/lib/keyed-task-store";
import {
  aiClient,
  type InteractionCheckBody,
  type InteractionResult,
} from "@/lib/ai-client";
import {
  getCachedEntry,
  setCache,
  interactionCacheKey,
} from "@/lib/interaction-cache";
import { useUpdatePrescription } from "@/hooks/use-medication-queries";
import { buildInteractionCheck, legacyInteractionFields } from "@/lib/medicine-about";

// --- Types ---

export type { InteractionItem, InteractionResult } from "@/lib/ai-client";

type CheckParams = InteractionCheckBody;
type ActivePrescription = CheckParams["activePrescriptions"][number];

// --- useInteractionCheck ---
// The client stops a check at the route's maxDuration plus a grace (the
// adapter's default); the route's own deadline (50 s) answers with a JSON
// 504 before that.

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

    setIsLoading(true);
    setError(null);
    setData(null);
    setCachedAt(null);

    const response = await aiClient.call("/api/ai/interaction-check", params, {
      signal: controller.signal,
    });
    // Superseded by a newer check (or reset): that one owns the state now.
    if (!response.ok && response.error.code === "CANCELLED") return null;
    if (abortRef.current === controller) abortRef.current = null;

    if (!response.ok) {
      setError(
        response.error.code === "AI_TIMEOUT" ? "Interaction check timed out" : response.error.message,
      );
      setIsLoading(false);
      return null;
    }

    const result = response.data;
    setData(result);
    setIsLoading(false);

    // Cache lookup results
    if (cacheKey) {
      setCache(cacheKey, result);
    }

    return result;
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
      set({ isRefreshing: true });

      try {
        const response = await aiClient.call(
          "/api/ai/interaction-check",
          { mode: "conflict", newMedication: genericName, activePrescriptions },
          { signal: controller.signal },
        );
        // Superseded by a newer check: say nothing, it owns the state now.
        if (controller.signal.aborted) return null;
        if (!response.ok) {
          const { code, message } = response.error;
          set({
            error: code === "AI_TIMEOUT" ? MSG_TIMEOUT : code === "OFFLINE" ? MSG_OFFLINE : message,
            isRefreshing: false,
          });
          return null;
        }

        const result = response.data;
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
        // The prescription update failed.
        set({
          error: err instanceof Error ? err.message : "Interaction check failed",
          isRefreshing: false,
        });
        return null;
      } finally {
        if (refreshes.controllers.get(prescriptionId) === controller) {
          refreshes.controllers.delete(prescriptionId);
        }
      }
    },
    [prescriptionId, updatePrescription]
  );

  return { refresh, isRefreshing, error };
}
