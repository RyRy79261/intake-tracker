/**
 * HMAC signature verification for the analytics insights webhook.
 *
 * Requests are authenticated with a shared secret rather than a user session:
 * the caller signs `${timestamp}.${rawBody}` with HMAC-SHA256 and sends the
 * timestamp and hex signature as headers. The server recomputes the signature
 * and compares it in constant time. The timestamp is bound into the signed
 * payload and checked against a freshness window so a captured request cannot
 * be replayed later.
 */

import crypto from "node:crypto";

/** Header carrying the unix-ms timestamp the signature was computed at. */
export const WEBHOOK_TIMESTAMP_HEADER = "x-analytics-timestamp";
/** Header carrying the hex-encoded HMAC-SHA256 signature. */
export const WEBHOOK_SIGNATURE_HEADER = "x-analytics-signature";

/** Default replay window: a request is rejected if its timestamp is older or
 *  further in the future than this. */
export const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

export type WebhookRejectionReason =
  | "no_secret"
  | "missing_signature"
  | "missing_timestamp"
  | "stale_timestamp"
  | "bad_signature";

export interface WebhookVerificationResult {
  valid: boolean;
  reason?: WebhookRejectionReason;
}

/**
 * Compute the hex HMAC-SHA256 signature for a webhook request. Exported so
 * callers (and tests) can produce a signature with the same scheme.
 */
export function signWebhookPayload(
  timestamp: string,
  rawBody: string,
  secret: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

/**
 * Verify an analytics webhook request. Returns `{ valid: false, reason }` for
 * every failure mode so the route can log the cause without leaking it to the
 * caller.
 */
export function verifyWebhookSignature(params: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string | undefined;
  now?: number;
  toleranceMs?: number;
}): WebhookVerificationResult {
  const { rawBody, timestamp, signature, secret } = params;
  const now = params.now ?? Date.now();
  const toleranceMs = params.toleranceMs ?? DEFAULT_TOLERANCE_MS;

  if (!secret) return { valid: false, reason: "no_secret" };
  if (!signature) return { valid: false, reason: "missing_signature" };
  if (!timestamp) return { valid: false, reason: "missing_timestamp" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > toleranceMs) {
    return { valid: false, reason: "stale_timestamp" };
  }

  const expected = signWebhookPayload(timestamp, rawBody, secret);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(signature, "hex");

  // timingSafeEqual throws on length mismatch — guard first so a malformed
  // signature is a clean rejection rather than an exception.
  if (
    expectedBuf.length === 0 ||
    expectedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return { valid: false, reason: "bad_signature" };
  }

  return { valid: true };
}
