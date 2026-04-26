import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.intaketracker.app",
  appName: "Intake Tracker",
  webDir: "out",
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // Patch fetch on Android to use native HTTP, bypassing CORS so the APK
    // can call /api/* on the deployed origin (NEXT_PUBLIC_API_BASE_URL)
    // without the server having to set Access-Control-Allow-Origin headers.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
