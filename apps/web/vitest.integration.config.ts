import path from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// See vitest.config.ts: alias the `server-only` / `client-only` bundler markers
// to an empty stub so integration tests (which hit the real Drizzle/Neon layer)
// can import server modules under the node environment.
const BUNDLER_MARKER_STUB = path.resolve(
  process.cwd(),
  "src/__tests__/helpers/bundler-markers-stub.ts",
);

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": BUNDLER_MARKER_STUB,
      "client-only": BUNDLER_MARKER_STUB,
    },
  },
  test: {
    environment: "node",
    include: ["src/__tests__/integration/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    globals: false,
  },
});
