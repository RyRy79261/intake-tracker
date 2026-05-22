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
      // Count every source file, not just the ones a test happens to import,
      // so the percentage reflects the real codebase.
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/__tests__/**",
        "src/**/__tests__/**",
      ],
      // Coverage ratchet: CI's `coverage` job runs `pnpm test:coverage`, which
      // exits non-zero when any metric drops below these floors. Raise them as
      // coverage improves — never lower them.
      thresholds: {
        lines: 28,
        statements: 27,
        functions: 21,
        branches: 18,
      },
    },
  },
});
