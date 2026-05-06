import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bio.intaketracker',
  appName: 'Intake Tracker',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
};

export default config;
