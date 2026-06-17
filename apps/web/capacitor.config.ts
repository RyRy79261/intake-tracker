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
  },
};

export default config;
