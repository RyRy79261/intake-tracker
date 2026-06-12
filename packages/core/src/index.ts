/**
 * @intake/core — pure, I/O-free domain logic for intake-tracker.
 *
 * Depends only on @intake/types and sits one layer up from it
 * (`types ← core ← ui ← apps`). Every export here is a pure function or
 * factory: deterministic, no side effects, no persistence.
 *
 * PURITY GUARD: this package's tsconfig deliberately ships NO DOM lib and NO
 * `@types/node`, so `window` / `document` / `localStorage` / `btoa` / `atob` /
 * `navigator` / `process` are not in scope — referencing them is a compile
 * error. Wall-clock readers (`Date.now()` / bare `new Date()`) and `Math.random`
 * are still in the ES2022 lib, so they are additionally banned by this package's
 * `eslint.config.mjs` (`no-restricted-syntax`) — core takes an injected `now`/
 * `tz` instead. (Example: `correlateTimeSeries` takes a `timezone` param rather
 * than reading the host zone. `buildInsightsPrompt` deliberately stays in
 * apps/web — it is already pure but is AI-prompt-coupled, so it rides with the
 * future `@intake/ai-prompts` extraction.)
 *
 * Subpath exports mirror the file layout — prefer the granular paths
 * (`@intake/core/compound`, `@intake/core/security`, …) over this barrel.
 */
export * from "./alcohol-units";
export * from "./compound-utils";
export * from "./progress-utils";
export * from "./settings-helpers";
export * from "./service-result";
export * from "./security";
export * from "./shake-detector";
export * from "./analytics-stats";
