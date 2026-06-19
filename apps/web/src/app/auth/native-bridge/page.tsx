"use client";

import { useEffect, useState } from "react";

/**
 * Native Google sign-in — STEP 2 (runs in the Custom Tab after the OAuth
 * return). By the time this renders, Neon Auth's middleware has already
 * exchanged the verifier and set the session cookie (the matcher covers
 * /auth/*). This page mints a one-time code from that session (server reads the
 * HttpOnly cookie) and hands ONLY the code back to the app via a verified HTTPS
 * App Link — never the session token in a URL.
 *
 * Client component (not a server component) so it survives the Capacitor
 * `output: export` build; the cookie-reading lives in /api/native-auth/mint,
 * which the export stashes out.
 */

// Production origin: the App Link host that assetlinks.json delegates to the app.
const APP_ORIGIN = "https://intake-tracker.ryanjnoble.dev";

export default function NativeSignInBridge() {
  const [appLink, setAppLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/native-auth/mint", {
          method: "POST",
          credentials: "include",
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
        const link = `${APP_ORIGIN}/auth/native-done?code=${encodeURIComponent(data.code)}`;
        if (cancelled) return;
        setAppLink(link);
        // Auto-return; the visible button is the reliable fallback if the
        // Custom Tab doesn't fire the App Link on a programmatic navigation.
        window.location.replace(link);
      } catch {
        if (!cancelled) setError("Something went wrong finishing sign-in.");
      }
    })();
    return () => {
      cancelled = true;
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
