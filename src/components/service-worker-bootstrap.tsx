"use client";

import { useEffect } from "react";

const BYPASS_QUERY_PARAM = "bypass";
const BYPASS_KEY = "intake-tracker-bypass-auth";
const DEFAULT_BYPASS_CODE = "meowmeowmeow";

function getBypassCode(): string {
  return process.env.NEXT_PUBLIC_BYPASS_CODE || DEFAULT_BYPASS_CODE;
}

/**
 * Belt-and-suspenders SW registration + early-boot URL bypass trigger.
 *
 * Two jobs bundled here because both need to run as early as possible on
 * the client, before AuthGuard, Privy, or anything else:
 *
 * 1) Register `/sw.js`. next-pwa normally injects its own register script
 *    into main.js, but that has silently failed in some builds. Re-register
 *    is idempotent, so this is safe either way. Guarded to production
 *    Vercel env to match the build-time gate in next.config.js.
 *
 * 2) Detect `?bypass=CODE` in the URL and activate the emergency bypass
 *    grace before any AuthGuard renders. Previously this ran inside
 *    AuthGuard, but that meant a URL like `/medications?bypass=xxx`
 *    wouldn't activate it until AuthGuard mounted, and offline users who
 *    were locked out of AuthGuard couldn't reach it at all. Now it runs
 *    unconditionally on every page boot. Strips the param from the URL
 *    after activation so the code doesn't stick in history or share URLs.
 */
export function ServiceWorkerBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // URL bypass trigger — runs before SW registration side-effects matter.
    const url = new URL(window.location.href);
    const code = url.searchParams.get(BYPASS_QUERY_PARAM);
    if (code) {
      if (code === getBypassCode()) {
        window.localStorage.setItem(BYPASS_KEY, String(Date.now()));
      }
      url.searchParams.delete(BYPASS_QUERY_PARAM);
      const cleaned = url.pathname + (url.search ? url.search : "") + url.hash;
      window.history.replaceState(null, "", cleaned);
    }

    if (!("serviceWorker" in navigator)) return;

    const env = process.env.NEXT_PUBLIC_VERCEL_ENV;
    if (env && env !== "production") return;

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
  }, []);

  return null;
}
