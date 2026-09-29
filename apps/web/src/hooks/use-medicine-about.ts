import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { readAiErrorMessage } from "@/lib/ai-error-message";
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

/**
 * "About this medicine": look the prescription up with POST
 * /api/ai/medicine-about and store the answer on it (`medicineInfo`).
 * Sends only the generic name (and a combination's compound names).
 * Cancel and unmount abort the request; a cancelled lookup stores nothing.
 */
export function useMedicineAbout({ timeoutMs = MEDICINE_ABOUT_TIMEOUT_MS }: { timeoutMs?: number } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updatePrescription = useUpdatePrescription();
  const ctrl = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    ctrl.current?.abort();
    ctrl.current = null;
  }, []);

  useEffect(() => abort, [abort]);

  const cancel = useCallback(() => {
    abort();
    setBusy(false);
  }, [abort]);

  const lookUp = useCallback(
    async (prescription: Prescription): Promise<MedicineInfo | null> => {
      abort();
      setError(null);
      if (offline()) {
        setError(MSG_ABOUT_OFFLINE);
        return null;
      }
      const controller = new AbortController();
      ctrl.current = controller;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      setBusy(true);
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
          setBusy(false);
          return null;
        }
        if (!response.ok) {
          const msg = await describeFailure(response, name);
          if (!controller.signal.aborted) {
            setError(msg);
            setBusy(false);
          }
          return null;
        }
        const raw = (await response.json()) as Record<string, unknown>;
        if (controller.signal.aborted) return null;
        const info = normalizeMedicineInfo({ ...raw, fetchedAt: Date.now() });
        if (!info) {
          setError(`No information was found for “${name}”. Check the generic name in Prescription Details.`);
          setBusy(false);
          return null;
        }
        await updatePrescription.mutateAsync({ id: prescription.id, updates: { medicineInfo: info } });
        setBusy(false);
        return info;
      } catch {
        if (controller.signal.aborted) {
          // Cancel/unmount says nothing; the client timeout does.
          if (timedOut) {
            setError(MSG_TIMEOUT);
            setBusy(false);
          }
          return null;
        }
        setError(offline() ? MSG_ABOUT_OFFLINE : MSG_FAILED);
        setBusy(false);
        return null;
      } finally {
        clearTimeout(timer);
        if (ctrl.current === controller) ctrl.current = null;
      }
    },
    [abort, timeoutMs, updatePrescription],
  );

  return { lookUp, cancel, busy, error };
}
