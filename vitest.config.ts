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
      // Count every source file in `include`, not just the ones a test
      // happens to import, so the percentage reflects the real codebase.
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
      //
      // Per-file thresholds (P1 #8) layer on top of the global floors and
      // gate the modules whose regressions would hurt data integrity,
      // backup safety, or clinical math. Each per-file floor is set to
      // current-coverage-minus-headroom so it ratchets monotonically.
      //
      // Audit also recommended folder-wide floors for src/lib/mcp/ (85%
      // lines, "auth boundary") and src/app/api/ (75% lines, "external
      // surface"). Both folders still contain a handful of files at 0%
      // coverage (mcp/queries.ts, mcp/tools.ts, several API routes) that
      // drag the folder average below those floors. Adding the folder
      // thresholds here would need either targeted tests or excludes
      // first — left for a follow-up PR.
      thresholds: {
        lines: 54,
        statements: 53,
        functions: 45,
        branches: 44,
        // Sync layer — data integrity. sync-engine.ts is the weakest link
        // of the four; queue / payload / topology all sit ≥95%.
        "src/lib/sync-engine.ts": {
          lines: 90,
          statements: 85,
          functions: 78,
          branches: 72,
        },
        "src/lib/sync-queue.ts": {
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 100,
        },
        "src/lib/sync-payload.ts": {
          lines: 95,
          statements: 95,
          functions: 100,
          branches: 80,
        },
        "src/lib/sync-topology.ts": {
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 100,
        },
        // Backup safety — see src/lib/backup-service.test.ts for the
        // failure-path coverage that lifts this above the 70% audit floor.
        "src/lib/backup-service.ts": {
          lines: 80,
          statements: 75,
          functions: 63,
          branches: 82,
        },
        // Clinical math + records CRUD. See health-service.test.ts.
        "src/lib/health-service.ts": {
          lines: 88,
          statements: 88,
          functions: 95,
          branches: 95,
        },
      },
    },
  },
});
