import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/__tests__/integration/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    globals: false,
  },
});
