import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.ryanjnoble.intaketracker',
  appName: 'Intake Tracker',
  // Relative to this config (apps/web): the static export from `next build`.
  webDir: 'out',
  // The native project stays at the monorepo root; this config, the Capacitor
  // CLI, and the @capacitor/* plugins all live in apps/web, so `cap sync` (run
  // from apps/web) discovers plugins from apps/web/package.json and writes to
  // the root android/ project via this path.
  android: {
    path: '../../android',
  },
  server: {
    androidScheme: 'https',
    // Load the LIVE web app instead of the bundled static export, so the
    // WebView runs at the real origin (https://intake-tracker.ryanjnoble.dev).
    // This makes auth (cookies + OAuth redirects), sync, and AI behave exactly
    // like the website — the only way to get in-app Google sign-in, because the
    // bundled https://localhost origin + managed Neon Auth cannot complete the
    // OAuth round-trip (no idToken support, no custom-scheme callback). The
    // live site's service worker caches the shell for offline launch.
    // (webDir 'out' is still built + required by Capacitor, but unused for load.)
    url: 'https://intake-tracker.ryanjnoble.dev',
    // Keep the OAuth round-trip (Neon Auth hosted host + Google) INSIDE the
    // WebView so the session cookie is shared back to the app. Without this,
    // Capacitor opens off-origin hosts in the external browser and the cookie
    // never returns. NOTE: Google may still refuse OAuth in an embedded WebView
    // (disallowed_useragent) — verify on-device; email/password is unaffected.
    allowNavigation: ['*.neon.tech', 'accounts.google.com', '*.google.com'],
  },
};

export default config;
