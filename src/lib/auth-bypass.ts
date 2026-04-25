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

// 18-day window for both the bypass and the remembered-Privy-login grace.
// Long enough for a typical offline trip; short enough that an unattended
// device doesn't stay unlocked indefinitely.
export const BYPASS_TTL_MS = 18 * 24 * 60 * 60 * 1000;

export const DEFAULT_BYPASS_CODE = "meowmeowmeow";

export function getBypassCode(): string {
  return process.env.NEXT_PUBLIC_BYPASS_CODE || DEFAULT_BYPASS_CODE;
}
