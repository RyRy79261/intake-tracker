/**
 * Playwright config structural validation — verifies that playwright.config.ts
 * encodes the correct CI dual-mode webServer and service worker blocking.
 *
 * Behavioral framing:
 *   E2E-01: E2E tests use Chromium in CI against a production build so the
 *           test environment matches real user deployments.
 *   E2E-03: Service workers are blocked so page.route() mocks intercept
 *           requests before the PWA service worker can cache or handle them.
 *
 * Run with: pnpm exec vitest run src/__tests__/playwright-config.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const PLAYWRIGHT_CONFIG_PATH = path.resolve(
  process.cwd(),
  "playwright.config.ts"
);

let raw: string;

beforeAll(() => {
  if (!fs.existsSync(PLAYWRIGHT_CONFIG_PATH)) {
    throw new Error(`playwright.config.ts not found at ${PLAYWRIGHT_CONFIG_PATH}`);
  }
  raw = fs.readFileSync(PLAYWRIGHT_CONFIG_PATH, "utf-8");
});

describe("Playwright config blocks service workers so page.route() mocks work (E2E-03)", () => {
  it("config contains serviceWorkers: 'block' in the use object", () => {
    // Without this, the PWA service worker intercepts fetch requests before
    // page.route() handlers fire, causing AI mock routes to be bypassed.
    // This must be set globally in the `use` block so all tests benefit.
    expect(raw).toContain("serviceWorkers: 'block'");
  });
});

describe("Playwright config switches to production build in CI (E2E-01, E2E-03)", () => {
  it("config uses process.env.CI ternary to select webServer mode", () => {
    // The ternary ensures local runs use the dev server (fast iteration)
    // while CI uses the production build (realistic service worker behaviour).
    expect(raw).toContain("process.env.CI");
  });

  it("CI branch uses pnpm build to compile a production bundle", () => {
    // E2E-01 requirement: tests must run against the production build in CI,
    // not the dev server, so Next.js inlines env vars and service workers activate.
    expect(raw).toContain("pnpm build");
  });

  it("CI branch uses pnpm start to serve the production bundle", () => {
    // The production build must be served via `next start`, not `next dev`,
    // so the compiled bundle with inlined env vars is what tests exercise.
    expect(raw).toContain("pnpm start");
  });

  it("config defines a 'setup' project that runs auth.setup.ts", () => {
    // The setup project authenticates via Privy test account before other
    // tests run, so all tests start with a real authenticated session.
    expect(raw).toContain("name: 'setup'");
    expect(raw).toMatch(/testMatch:.*auth\\.setup\\.ts/);
  });

  it("chromium project uses authenticated storageState from setup", () => {
    // After the setup project authenticates, all chromium tests receive
    // the saved auth state so they start already logged in.
    expect(raw).toContain("storageState: 'e2e/.auth/user.json'");
  });

  it("chromium project depends on the setup project", () => {
    // This ensures Playwright runs auth.setup.ts before any other tests,
    // so the storageState file exists when chromium tests start.
    expect(raw).toContain("dependencies: ['setup']");
  });

  it("CI branch sets reuseExistingServer to false so tests always build fresh", () => {
    // reuseExistingServer: false prevents a stale server from a previous CI run
    // from being reused, which would skip the production build step.
    expect(raw).toContain("reuseExistingServer: false");
  });

  it("local dev branch uses pnpm run dev for fast iteration", () => {
    // Local mode should use the dev server with hot reload so developers get
    // fast feedback, not a full production build on every test run.
    expect(raw).toContain("pnpm run dev");
  });

  it("local dev branch sets reuseExistingServer to true", () => {
    // When the dev server is already running (`pnpm dev`), Playwright should
    // attach to it rather than start a second server on the same port.
    expect(raw).toContain("reuseExistingServer: true");
  });
});
