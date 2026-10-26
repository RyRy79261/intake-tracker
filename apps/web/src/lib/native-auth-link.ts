// Production origin: the App Link host that assetlinks.json delegates to the app.
const APP_ORIGIN = "https://intake-tracker.ryanjnoble.dev";
const APP_HOST = "intake-tracker.ryanjnoble.dev";
const RETURN_PATH = "/auth/native-done";
const ANDROID_PACKAGE = "dev.ryanjnoble.intaketracker";

/**
 * The link that hands the one-time code back to the app.
 *
 * On Android this is an `intent://` URL naming the app's package, not the bare
 * HTTPS App Link. A Chrome-installed copy of the site (WebAPK) claims every URL
 * in its scope ("/"), /auth/native-done included, so the bare link could open
 * that web copy instead of the app and the code never reached the app. An
 * explicit package goes only to the app; another app can't claim it.
 *
 * No `S.browser_fallback_url`: Chrome blocks an intent launched without a user
 * gesture (the auto-redirect runs after an async fetch) and would follow the
 * fallback, leaving the bridge page and its "Return to Intake Tracker" button.
 * Without a fallback a blocked launch stays put, so the button still works.
 */
export function buildReturnLink(code: string, userAgent: string): string {
  const query = `code=${encodeURIComponent(code)}`;
  if (!/Android/i.test(userAgent)) return `${APP_ORIGIN}${RETURN_PATH}?${query}`;
  return `intent://${APP_HOST}${RETURN_PATH}?${query}#Intent;scheme=https;package=${ANDROID_PACKAGE};end`;
}
