/**
 * Lightweight in-process IP rate limiter used by AI routes.
 *
 * Caveat: state is held in the route module's Map and is therefore scoped to
 * a single Node process. On serverless platforms (Vercel functions) each
 * cold start resets the counters and concurrent instances each have their
 * own copy, so a determined attacker can exceed the nominal limit by
 * targeting fresh instances. The limiter is still useful as a coarse
 * defence against accidental client loops; per-IP enforcement that
 * survives cold starts requires an external store (Redis / KV).
 *
 * x-forwarded-for can contain multiple comma-separated IPs when the
 * request passes through proxies — splitting on the first entry is the
 * standard convention but the value is client-controllable and may be
 * spoofed.
 */

import type { NextRequest } from "next/server";

export interface RateLimiter {
  check(ip: string): boolean;
}

interface Bucket {
  count: number;
  resetTime: number;
}

/**
 * Create a per-route limiter. Each call to createRateLimiter returns an
 * independent Map so two routes never share counters.
 *
 * @param limit  Max requests within `windowMs` per IP.
 * @param windowMs  Rolling window length in ms (defaults to 60s).
 */
export function createRateLimiter(limit: number, windowMs: number = 60_000): RateLimiter {
  const buckets = new Map<string, Bucket>();
  return {
    check(ip: string): boolean {
      const now = Date.now();
      const bucket = buckets.get(ip);
      if (!bucket || now > bucket.resetTime) {
        buckets.set(ip, { count: 1, resetTime: now + windowMs });
        return true;
      }
      if (bucket.count >= limit) return false;
      bucket.count++;
      return true;
    },
  };
}

/**
 * Extract a best-effort IP for a NextRequest. Falls back to "unknown" when
 * no proxy headers are present (typically local dev).
 */
export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
