/**
 * Offline-safe navigation.
 *
 * App Router's `router.push` fetches the RSC payload for the target page
 * before switching, so it dies silently when offline and the RSC endpoint
 * can't be reached. Instead of hacking around that, we just do a hard
 * navigation via `window.location.assign`: the browser issues a plain
 * navigation request for the URL, our SW's precache serves the cached HTML,
 * and the page loads — online or offline.
 *
 * Slightly less snappy online (full document swap), but reliably works
 * offline, which matters more for a health-tracking PWA on a multi-week
 * offline trip.
 */
export function navigateTo(path: string): void {
  if (typeof window === "undefined") return;
  window.location.assign(path);
}
