import { useCallback, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { readAiErrorMessage } from "@/lib/ai-error-message";
import { createKeyedTaskStore } from "@/lib/keyed-task-store";
import { normalizeMedicineInfo } from "@/lib/medicine-about";
import { useUpdatePrescription } from "@/hooks/use-medication-queries";
import type { MedicineInfo, Prescription } from "@/lib/db";

/**
 * Client-side stop for one lookup: the route's maxDuration (60 s). Its own
 * deadline (50 s) answers with a JSON 504 before this fires.
 */
export const MEDICINE_ABOUT_TIMEOUT_MS = 60_000;

export const MSG_ABOUT_OFFLINE = "You are offline. Connect to the internet and try again.";
const MSG_TIMEOUT = "The lookup took too long and stopped. Try again.";
const MSG_FAILED = "The AI service did not answer. Try again later.";
const MSG_RATE = "Too many lookups. Wait a minute and try again.";
/** Route error codes whose message tells the user what to do. */
const ACTIONABLE_CODES = new Set(["NO_AI_KEY", "KEY_UNREADABLE", "INVALID_KEY", "AI_REFUSED"]);

const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;

async function describeFailure(response: Response, name: string): Promise<string> {
  if (response.status === 404) {
    return `No information was found for “${name}”. Check the generic name in Prescription Details.`;
  }
  if (response.status === 504) return MSG_TIMEOUT;
  if (response.status === 429) return MSG_RATE;
  const code = await response
    .clone()
    .json()
    .then((b: { code?: unknown }) => (typeof b.code === "string" ? b.code : ""))
    .catch(() => "");
  if (ACTIONABLE_CODES.has(code)) return readAiErrorMessage(response, MSG_FAILED);
  return MSG_FAILED;
}

interface AboutState {
  busy: boolean;
  error: string | null;
}
const IDLE: AboutState = { busy: false, error: null };

/**
 * Lookups by prescription id. Held outside the view: a lookup takes up to a
 * minute, and going Back while it runs must not throw the answer away.
 */
const lookups = createKeyedTaskStore<AboutState>(IDLE);

/** Stop every lookup and forget their state (tests). */
export const resetMedicineAboutLookups = () => lookups.reset();

/**
 * "About this medicine": look the prescription up with POST
 * /api/ai/medicine-about and store the answer on it (`medicineInfo`).
 * Sends only the generic name (and a combination's compound names).
 *
 * The lookup belongs to the prescription, not to the view: it keeps running
 * when the view closes and its answer is still stored, and a view opened
 * again meanwhile shows it as busy. Only Cancel (or the timeout) stops it; a
 * cancelled lookup stores nothing.
 */
export function useMedicineAbout(
  prescriptionId: string,
  { timeoutMs = MEDICINE_ABOUT_TIMEOUT_MS }: { timeoutMs?: number } = {},
) {
  const { busy, error } = useSyncExternalStore(
    lookups.subscribe,
    () => lookups.get(prescriptionId),
    () => IDLE,
  );
  const updatePrescription = useUpdatePrescription();

  const cancel = useCallback(() => {
    lookups.controllers.get(prescriptionId)?.abort();
    lookups.controllers.delete(prescriptionId);
    lookups.set(prescriptionId, { busy: false });
  }, [prescriptionId]);

  const lookUp = useCallback(
    async (prescription: Prescription): Promise<MedicineInfo | null> => {
      const id = prescription.id;
      const set = (patch: Partial<AboutState>) => lookups.set(id, patch);
      lookups.controllers.get(id)?.abort();
      lookups.controllers.delete(id);
      set({ error: null });
      if (offline()) {
        set({ error: MSG_ABOUT_OFFLINE });
        return null;
      }
      const controller = new AbortController();
      lookups.controllers.set(id, controller);
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      set({ busy: true });
      const name = prescription.genericName;
      const compounds = (prescription.compounds ?? []).map((c) => c.name).filter(Boolean);

      try {
        const response = await apiFetch("/api/ai/medicine-about", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            genericName: name,
            ...(compounds.length > 1 && { compounds }),
          }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return null;
        if (!response) {
          // Sign-in dismissed.
          set({ busy: false });
          return null;
        }
        if (!response.ok) {
          const msg = await describeFailure(response, name);
          if (!controller.signal.aborted) set({ error: msg, busy: false });
          return null;
        }
        const raw = (await response.json()) as Record<string, unknown>;
        if (controller.signal.aborted) return null;
        // `forName`: the name this answer is for, so a later rename shows.
        const info = normalizeMedicineInfo({ ...raw, fetchedAt: Date.now(), forName: name });
        if (!info) {
          set({
            error: `No information was found for “${name}”. Check the generic name in Prescription Details.`,
            busy: false,
          });
          return null;
        }
        await updatePrescription.mutateAsync({ id, updates: { medicineInfo: info } });
        set({ busy: false });
        return info;
      } catch {
        if (controller.signal.aborted) {
          // Cancel (or a newer lookup) says nothing; the client timeout does.
          if (timedOut) set({ error: MSG_TIMEOUT, busy: false });
          return null;
        }
        set({ error: offline() ? MSG_ABOUT_OFFLINE : MSG_FAILED, busy: false });
        return null;
      } finally {
        clearTimeout(timer);
        if (lookups.controllers.get(id) === controller) lookups.controllers.delete(id);
      }
    },
    [timeoutMs, updatePrescription],
  );

  return { lookUp, cancel, busy, error };
}
