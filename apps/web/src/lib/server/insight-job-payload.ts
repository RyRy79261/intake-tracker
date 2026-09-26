/**
 * Shape of `insight_jobs.request_payload`.
 *
 * A deep job's batch lives in the Anthropic org of the key that submitted it,
 * so the poller has to talk to Anthropic with that same key — not whatever
 * the caller's key happens to resolve to by the time the batch ends. The
 * table has no key columns, so the key identity rides in the jsonb payload
 * next to the request:
 *
 *   { request: AnalyticsInsightsRequest, key: { keySource, keyOwnerId } }
 *
 * Rows written before the envelope existed hold the bare request. Both
 * readers accept that legacy shape, and a legacy row has no pinned key.
 *
 * Once a job is terminal the payload is replaced with FINALISED_JOB_PAYLOAD:
 * it carries the user's conditions and medications, and nothing reads it
 * after the job stops being pending.
 */
import type { AnalyticsInsightsRequest } from "@intake/ai-prompts/analytics-insights";
import type { KeySource } from "@/lib/ai-key-resolver";

export interface InsightJobKeyRef {
  keySource: KeySource;
  /** userId whose stored key submitted the batch (null for the env key). */
  keyOwnerId: string | null;
}

/**
 * The key a pending job was submitted with can no longer be resolved, so its
 * batch can't be collected. Defined here rather than next to the resolver so
 * the polling route can recognise it without the DB-backed module.
 */
export class PinnedKeyUnavailableError extends Error {
  constructor(public keySource: KeySource) {
    super(
      "The API key this deep analysis was started with is no longer available, so its result can't be collected. Start a new deep analysis.",
    );
    this.name = "PinnedKeyUnavailableError";
  }
}

export interface InsightJobPayload {
  request: AnalyticsInsightsRequest;
  key: InsightJobKeyRef;
}

/** What a terminal job's request_payload is reduced to (the column is NOT NULL). */
export const FINALISED_JOB_PAYLOAD = Object.freeze({}) as Record<string, never>;

const KEY_SOURCES: readonly KeySource[] = ["own_stored", "shared_from", "env_var"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function looksLikeRequest(v: unknown): v is AnalyticsInsightsRequest {
  return isObject(v) && isObject(v.range) && isObject(v.metrics);
}

export function buildJobPayload(
  request: AnalyticsInsightsRequest,
  key: InsightJobKeyRef,
): InsightJobPayload {
  return {
    request,
    key: { keySource: key.keySource, keyOwnerId: key.keyOwnerId },
  };
}

/** The submitted request, from either payload shape. Null once finalised. */
export function readJobRequest(
  payload: unknown,
): AnalyticsInsightsRequest | null {
  if (isObject(payload) && looksLikeRequest(payload.request)) {
    return payload.request;
  }
  if (looksLikeRequest(payload)) return payload;
  return null;
}

/** The key the batch was submitted with, or null for legacy / finalised rows. */
export function readJobKey(payload: unknown): InsightJobKeyRef | null {
  if (!isObject(payload) || !isObject(payload.key)) return null;
  const { keySource, keyOwnerId } = payload.key;
  if (!KEY_SOURCES.includes(keySource as KeySource)) return null;
  if (keyOwnerId !== null && typeof keyOwnerId !== "string") return null;
  return { keySource: keySource as KeySource, keyOwnerId };
}
