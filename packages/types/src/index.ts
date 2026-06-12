/**
 * @intake/types — the dependency-root package: isomorphic, runtime-free shared
 * types for the intake-tracker monorepo.
 *
 * No `client-only` / `server-only`, no React, no Dexie — safe to import from any
 * layer (the Next app, API route handlers, and the other `@intake/*` packages).
 * It must stay free of runtime so it can sit at the bottom of the dependency
 * graph (`types ← core ← ui ← apps`, with `db` + `core` siblings on `types`).
 *
 * Subpath exports:
 *   "@intake/types/records" — the Dexie record / data-shape interfaces plus
 *     their enums and unions (the canonical client data model). Mirrored
 *     field-for-field by `@intake/db/schema`; the parity is enforced by
 *     apps/web's `schema-parity.test.ts` (its extractor parses this very file).
 */
export * from "./records";
