import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.ryanjnoble.intaketracker',
  appName: 'Intake Tracker',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
};

export default config;
