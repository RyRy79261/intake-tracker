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
 * error. (Wall-clock readers — `Date.now()` / `new Date()` — are still in the
 * ES2022 lib, so they are NOT structurally blocked; core code must instead take
 * an injected `now`. The two date-dependent analytics functions stay in
 * apps/web until the Phase 3.1 now/tz-injection follow-up.)
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
