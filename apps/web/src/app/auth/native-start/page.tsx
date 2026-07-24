"use client";

import { useEffect, useState } from "react";
import { signIn } from "@/lib/auth-client";

/**
 * Native Google sign-in — STEP 1 (runs in the app's system-browser Custom Tab,
 * loaded from the deployed site, NOT the bundled app).
 *
 * Kicks off Neon Auth's hosted Google flow with `callbackURL` pointed at
 * /native-auth/bridge. Because this runs in a real browser tab (not the app
 * WebView), Google permits the OAuth, and the PKCE challenge cookie is set in
 * this same browser context — so the verifier exchange on the return trip
 * succeeds. The app opens this URL via @capacitor/browser.
 *
 * The callback deliberately lives OUTSIDE /auth/*: the Neon Auth middleware
 * skips its verifier exchange for any path prefixed by loginUrl ("/auth"),
 * which is exactly why the previous /auth/native-bridge callback never got a
 * session cookie (see native-auth/bridge/page.tsx).
 */
export default function NativeSignInStart() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    signIn
      .social({ provider: "google", callbackURL: "/native-auth/bridge" })
      .then((result) => {
        if (result && "error" in result && result.error) {
          setError(result.error.message ?? "Could not start Google sign-in.");
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not start Google sign-in.");
      });
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      {error ? (
        <>
          <h1 className="text-lg font-semibold text-destructive">Sign-in error</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <p className="text-sm text-muted-foreground">Close this window and try again from the app.</p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold">Redirecting to Google…</h1>
          <p className="text-sm text-muted-foreground">Continue signing in with Google.</p>
        </>
      )}
    </main>
  );
}
