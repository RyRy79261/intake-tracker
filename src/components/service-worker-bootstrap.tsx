"use client";

import { useEffect } from "react";

/**
 * Belt-and-suspenders service worker registration.
 *
 * next-pwa normally injects its own `register.js` at the top of `main.js` that
 * calls `workbox.register()` on boot. That auto-registration is silent when it
 * fails — if the injection step doesn't happen on a build (we've seen this
 * in practice), or if any earlier script on the page throws before workbox
 * runs, you end up with no SW at all and no way to know.
 *
 * This component registers `/sw.js` explicitly on every client boot. If the
 * SW is already registered, `.register()` is a no-op. If next-pwa's inlined
 * registration ran successfully, same deal. We only guard on the production
 * Vercel env so staging/preview builds (which don't ship a SW) aren't told
 * to fetch a 404.
 *
 * Failures are logged to the console to aid diagnosis — silent failures
 * here were the original bug.
 */
export function ServiceWorkerBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Mirror the build-time gate in next.config.js: next-pwa only generates
    // /sw.js when NODE_ENV=production AND VERCEL_ENV !== 'preview'. Trying
    // to register on other environments would 404.
    const env = process.env.NEXT_PUBLIC_VERCEL_ENV;
    if (env && env !== "production") return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Prime an update check so a stale SW gets refreshed soon after load.
        reg.update().catch(() => {
          /* offline or transient — fine, next load will retry */
        });
      })
      .catch((err) => {
        console.error("[SW] Registration failed:", err);
      });
  }, []);

  return null;
}
