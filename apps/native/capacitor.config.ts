import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.ryanjnoble.intaketracker',
  appName: 'Intake Tracker',
  // The Next.js static export produced by @intake/web
  // (`pnpm --filter @intake/web cap:export` -> apps/web/out). Relative to this
  // config in apps/native, so `../web/out`.
  webDir: '../web/out',
  android: {
    // The native project lives inside this package now (relocated from the repo
    // root). `cap sync`/`cap` run from apps/native resolve plugins from THIS
    // package.json (adjacent to the config) and write into ./android.
    path: 'android',
  },
  server: {
    // Bundled native app: serve the static export from the app's own assets
    // (WebView origin https://localhost). Deliberately NOT `server.url` — loading
    // the live site turns the shell into a remote browser, forfeits offline
    // launch (fatal for an offline-first tracker whose Dexie data is
    // authoritative), and does NOT defeat Google's `disallowed_useragent` block.
    // Native Google sign-in is handled separately via the system browser + an
    // HTTPS App Link bridge (Phase 2).
    androidScheme: 'https',
  },
  // Deterministic plugin discovery for the pnpm-workspace monorepo. Without this,
  // `cap sync` scans the package.json adjacent to this config and can be tripped
  // up by pnpm's isolated node_modules layout (ionic-team/capacitor#5028). The
  // explicit allowlist (bare package names — not paths, per #8072) pins exactly
  // the native plugins to include. @capacitor/android (platform) and
  // @capacitor/core (runtime) are always included and are not listed here.
  includePlugins: [
    '@capacitor/app',
    '@capacitor/browser',
    '@capacitor/local-notifications',
    '@capacitor/network',
  ],
};

export default config;
