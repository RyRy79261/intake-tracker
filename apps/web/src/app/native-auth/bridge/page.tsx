"use client";

import { useEffect, useState } from "react";
import { buildReturnLink } from "@/lib/native-auth-link";

/**
 * Native Google sign-in — STEP 2 (runs in the Custom Tab after the OAuth
 * return). By the time this renders, Neon Auth's middleware has already
 * exchanged the verifier and set the session cookie. This page mints a
 * one-time code from that session (server reads the HttpOnly cookie) and hands
 * ONLY the code back to the app via a verified HTTPS App Link — never the
 * session token in a URL.
 *
 * MUST live outside /auth/*: `auth.middleware({ loginUrl: "/auth" })`
 * early-allows every loginUrl-prefixed path BEFORE its verifier-exchange step
 * (processAuthMiddleware in @neondatabase/auth), so when this page lived at
 * /auth/native-bridge the `?neon_auth_session_verifier=` return was never
 * exchanged, no session cookie materialised, and /api/native-auth/mint 401'd
 * in production. middleware.ts routes /native-auth/* through the Neon Auth
 * middleware so the exchange runs here.
 *
 * Client component (not a server component) so it survives the Capacitor
 * `output: export` build; the cookie-reading lives in /api/native-auth/mint,
 * which the export stashes out.
 */

export default function NativeSignInBridge() {
  const [appLink, setAppLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    // Surface the error UI promptly if the mint server accepts then hangs,
    // instead of leaving the Custom Tab on a static screen until the OS socket
    // timeout fires. The catch below already handles the resulting AbortError.
    const timer = setTimeout(() => controller.abort(), 10_000);
    (async () => {
      try {
        const res = await fetch("/api/native-auth/mint", {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) {
          if (!cancelled) setError("Sign-in didn't complete. Please try again from the app.");
          return;
        }
        const data = (await res.json()) as { code?: string };
        if (!data.code) {
          if (!cancelled) setError("Sign-in didn't complete. Please try again from the app.");
          return;
        }
        const link = buildReturnLink(data.code, navigator.userAgent);
        if (cancelled) return;
        setAppLink(link);
        // Auto-return; Chrome may block it (no user gesture after the async
        // mint) and then stays on this page, so the button is the sure path.
        window.location.replace(link);
      } catch {
        if (!cancelled) setError("Something went wrong finishing sign-in.");
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      {error ? (
        <>
          <h1 className="text-lg font-semibold text-destructive">Sign-in error</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold">Returning to the app…</h1>
          {appLink && (
            <a
              href={appLink}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Return to Intake Tracker
            </a>
          )}
        </>
      )}
    </main>
  );
}
