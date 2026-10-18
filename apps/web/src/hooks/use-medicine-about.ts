import { useCallback, useSyncExternalStore } from "react";
import { aiClient, aiErrorText, aiTimeoutMs, type AiError } from "@/lib/ai-client";
import { createKeyedTaskStore } from "@/lib/keyed-task-store";
import { normalizeMedicineInfo } from "@/lib/medicine-about";
import { useUpdatePrescription } from "@/hooks/use-medication-queries";
import type { MedicineInfo, Prescription } from "@/lib/db";

/**
 * Client-side stop for one lookup: the route's maxDuration plus a grace. Its
 * own deadline (50 s) answers with a JSON 504 before this fires.
 */
export const MEDICINE_ABOUT_TIMEOUT_MS = aiTimeoutMs("/api/ai/medicine-about")!;

export const MSG_ABOUT_OFFLINE = "You are offline. Connect to the internet and try again.";
const MSG_TIMEOUT = "The lookup took too long and stopped. Try again.";
const MSG_FAILED = "The AI service did not answer. Try again later.";
const MSG_RATE = "Too many lookups. Wait a minute and try again.";
const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;

function describeFailure(error: AiError, name: string): string {
  switch (error.code) {
    case "NOT_FOUND":
      return `No information was found for “${name}”. Check the generic name in Prescription Details.`;
    case "AI_TIMEOUT":
      return MSG_TIMEOUT;
    case "RATE_LIMITED":
      return MSG_RATE;
    case "OFFLINE":
      return MSG_ABOUT_OFFLINE;
    default:
      return aiErrorText(error, MSG_FAILED);
  }
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
      set({ busy: true });
      const name = prescription.genericName;
      const compounds = (prescription.compounds ?? []).map((c) => c.name).filter(Boolean);

      try {
        const result = await aiClient.call(
          "/api/ai/medicine-about",
          { genericName: name, ...(compounds.length > 1 && { compounds }) },
          { signal: controller.signal, timeoutMs },
        );
        // Cancel (or a newer lookup) says nothing.
        if (controller.signal.aborted) return null;
        if (!result.ok) {
          set({ error: describeFailure(result.error, name), busy: false });
          return null;
        }
        // `forName`: the name this answer is for, so a later rename shows.
        const info = normalizeMedicineInfo({ ...result.data, fetchedAt: Date.now(), forName: name });
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
        // The prescription update failed.
        if (!controller.signal.aborted) set({ error: MSG_FAILED, busy: false });
        return null;
      } finally {
        if (lookups.controllers.get(id) === controller) lookups.controllers.delete(id);
      }
    },
    [timeoutMs, updatePrescription],
  );

  return { lookUp, cancel, busy, error };
}
