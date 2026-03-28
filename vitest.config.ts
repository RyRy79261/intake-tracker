import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["src/__tests__/setup.ts"],
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
      reportOnFailure: true,
    },
  },
});
