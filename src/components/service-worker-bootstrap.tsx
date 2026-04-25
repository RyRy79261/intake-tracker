"use client";

import { useEffect } from "react";
import { BYPASS_KEY, getBypassCode } from "@/lib/auth-bypass";

const BYPASS_QUERY_PARAM = "bypass";

function activateBypass(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BYPASS_KEY, String(Date.now()));
}

/**
 * Belt-and-suspenders SW registration + offline survival.
 *
 * Runs as early as possible on every client boot, before AuthGuard or
 * anything else that might hang:
 *
 * 1) Register `/sw.js`. next-pwa injects its own register into main.js,
 *    but that has silently failed on some builds. Idempotent if
 *    next-pwa's auto-register is already working.
 *
 * 2) Handle `?bypass=CODE` URL escape hatch. Previously this lived in
 *    AuthGuard, which meant users locked out by AuthGuard couldn't
 *    reach it. Now fires on every page, including /offline.
 *
 * 3) Auto-activate bypass when the device is offline. `navigator.onLine`
 *    is imperfect but when it reports `false` we're definitely offline,
 *    and in that case Privy absolutely cannot validate a session — so
 *    unconditionally extending the bypass grace is strictly better than
 *    locking the user into a dead sign-in card with nothing they can do.
 */
export function ServiceWorkerBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. URL bypass trigger
    const url = new URL(window.location.href);
    const code = url.searchParams.get(BYPASS_QUERY_PARAM);
    if (code) {
      if (code === getBypassCode()) {
        activateBypass();
      }
      url.searchParams.delete(BYPASS_QUERY_PARAM);
      const cleaned = url.pathname + (url.search ? url.search : "") + url.hash;
      window.history.replaceState(null, "", cleaned);
    }

    // 2. Auto-activate bypass when offline. `navigator.onLine === false`
    // is the one case where we know with certainty Privy can't reach its
    // servers; no reason to leave the user staring at a disabled login.
    const maybeBypassOffline = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        activateBypass();
      }
    };
    maybeBypassOffline();
    window.addEventListener("offline", maybeBypassOffline);

    // 3. SW registration
    if ("serviceWorker" in navigator) {
      const env = process.env.NEXT_PUBLIC_VERCEL_ENV;
      if (!env || env === "production") {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((reg) => {
            reg.update().catch(() => {
              /* offline or transient — fine, next load will retry */
            });
          })
          .catch((err) => {
            console.error("[SW] Registration failed:", err);
          });
      }
    }

    return () => {
      window.removeEventListener("offline", maybeBypassOffline);
    };
  }, []);

  return null;
}
