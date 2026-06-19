/**
 * Native (Capacitor) Google sign-in — client return handler.
 *
 * Companion to the server bridge (lib/native-auth-bridge.ts + the /auth/native-*
 * pages). In the native app, "Continue with Google" calls
 * {@link startNativeGoogleSignIn}, which opens the OS browser (Custom Tab) on the
 * deployed site's /auth/native-start. After sign-in the site returns to the app
 * via a verified HTTPS App Link (/auth/native-done?code=…).
 * {@link initNativeAuthReturn} catches that link — warm via `appUrlOpen`, cold
 * via `getLaunchUrl` — trades the one-time code for the Neon session token
 * (POST /api/native-auth/claim), stores it for the Bearer path, and reloads
 * authenticated.
 */
import { Capacitor } from "@capacitor/core";
import { apiFetch, saveAuthToken } from "@/lib/api-fetch";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const RETURN_PATH = "/auth/native-done";

/** Open the hosted Google flow in the system browser (Custom Tab). */
export async function startNativeGoogleSignIn(): Promise<void> {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: `${API_ORIGIN}/auth/native-start` });
}

/**
 * Handle an inbound App Link. Returns true if it was a native-auth return we
 * successfully claimed (and triggered a reload), false otherwise. Exported for
 * unit testing; production code reaches it via {@link initNativeAuthReturn}.
 */
export async function handleNativeAuthReturn(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.pathname !== RETURN_PATH) return false;
  const code = parsed.searchParams.get("code");
  if (!code) return false;

  try {
    const res = await apiFetch("/api/native-auth/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { token?: string };
    if (!data.token) return false;
    saveAuthToken(data.token);
  } catch {
    return false;
  }

  // Best-effort close the Custom Tab (a no-op on Android), then reload as an
  // authenticated session so useSession picks up the new Bearer token.
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {
    /* no-op */
  }
  window.location.replace("/");
  return true;
}

/** Register the App Link return listener. Safe to call on web (no-ops). */
export async function initNativeAuthReturn(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import("@capacitor/app");
  await App.addListener("appUrlOpen", (event) => {
    void handleNativeAuthReturn(event.url);
  });
  // Cold start: the app was launched directly by the App Link.
  const launch = await App.getLaunchUrl();
  if (launch?.url) void handleNativeAuthReturn(launch.url);
}
