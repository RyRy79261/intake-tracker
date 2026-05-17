import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  // tsconfig has jsx:"preserve" (Next.js handles the transform); vitest uses
  // esbuild directly, so opt into the automatic JSX runtime here for tests.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    setupFiles: ["src/__tests__/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**", "node_modules/**", ".claude/**", "src/__tests__/integration/**"],
    benchmark: {
      exclude: ["node_modules/**", ".claude/**"],
    },
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
      reportOnFailure: true,
    },
  },
});
