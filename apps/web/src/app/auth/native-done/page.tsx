"use client";

/**
 * Native Google sign-in — App Link target.
 *
 * When the app is installed and the App Link is verified, Android intercepts
 * this URL and opens the app directly (this web page never renders). It only
 * renders as a FALLBACK — opened in a browser when App Link verification didn't
 * take (e.g. a sideloaded install where autoVerify failed). In that case we tell
 * the user to return to the app; the app surfaces a manual code-entry recovery
 * (the `?code=` is intentionally not auto-actioned here — a web page must never
 * complete the sign-in).
 */
export default function NativeSignInDone() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Finishing sign-in…</h1>
      <p className="text-sm text-muted-foreground">
        Open the Intake Tracker app to complete signing in.
      </p>
    </main>
  );
}
