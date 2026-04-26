/**
 * Shared constants and helpers for the offline auth-bypass mechanism.
 *
 * Centralised here so AuthGuard, ServiceWorkerBootstrap, and the debug
 * panel all read the exact same localStorage keys and TTL — drift between
 * them previously meant code that "activated" the bypass in one place
 * could read inactive in another, defeating the offline grace window.
 */

export const BYPASS_KEY = "intake-tracker-bypass-auth";
export const REMEMBERED_AUTH_KEY = "intake-tracker-last-auth";

// 18 days. Picked to comfortably cover a 2–3 week offline trip (a typical
// camping/hiking/travel scenario for this single-user PWA) while still
// expiring on its own if the device gets lost or sits idle. Anything under
// ~2 weeks risks locking out a user who hasn't reopened the app between
// trips; anything much longer effectively becomes "permanent unlock".
export const BYPASS_TTL_MS = 18 * 24 * 60 * 60 * 1000;

/**
 * Returns the configured bypass code, or `null` when no code is configured.
 *
 * Fail-closed: we deliberately do NOT ship a hardcoded default. If
 * `NEXT_PUBLIC_BYPASS_CODE` is unset, the URL escape hatch and the
 * emergency bypass form are inert (no string can match `null`). The
 * navigator-onLine offline auto-activation path in ServiceWorkerBootstrap
 * still works without a code, so users on a genuinely offline device are
 * never locked out.
 */
export function getBypassCode(): string | null {
  const code = process.env.NEXT_PUBLIC_BYPASS_CODE;
  return code && code.length > 0 ? code : null;
}

/**
 * Stamp the bypass localStorage key with the current time so subsequent
 * `isBypassActive()` checks (in AuthGuard) grant access for BYPASS_TTL_MS.
 * Safe to call from any client context — guarded for SSR.
 */
export function activateBypass(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BYPASS_KEY, String(Date.now()));
}

/**
 * Remove the bypass timestamp. The next AuthGuard render falls back to
 * Privy / remembered-auth, so this is the user-visible "lock again" action.
 */
export function clearBypass(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(BYPASS_KEY);
}
