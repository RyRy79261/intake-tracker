/**
 * Offline-safe navigation helper.
 *
 * App Router's `router.push` fetches the RSC payload for the target page
 * before switching, so it dies silently when offline and the RSC endpoint
 * can't be reached. But doing a hard nav unconditionally causes the
 * next-themes script to re-run on every click, producing a visible
 * light-mode flash.
 *
 * Compromise: when `navigator.onLine` reports true, attempt a SPA
 * navigation via the passed-in router. When offline, bypass the router
 * and do a hard `window.location.assign()` so the browser issues a plain
 * navigation request that our SW precache serves.
 *
 * The online flag is imperfect on mobile, so when it says "online" and
 * the SPA nav actually fails we just accept that as a rare edge case;
 * the user can refresh.
 */
type RouterLike = { push: (href: string) => void };

export function navigateTo(path: string, router?: RouterLike): void {
  if (typeof window === "undefined") return;
  const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  if (online && router) {
    router.push(path);
    return;
  }
  window.location.assign(path);
}
