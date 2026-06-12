# Deferred work

Tracked items intentionally postponed during the Turborepo monorepo migration
(see `docs/TURBOREPO_MIGRATION_PROPOSAL.md`). Each entry says what was deferred,
why, and the trigger to pick it up.

## ESLint — ratchet deferred strict rules to `error`

**Deferred (2026-06-08, ESLint 8 → 10 flat migration).** Adopting
`@eslint/js` recommended + `typescript-eslint` recommended surfaced **91**
violations the old Next-only config never enforced. The May 2026 audit had
already deferred the strict TypeScript ruleset to "a dedicated cleanup pass",
so these ride at `warn` (visible, non-blocking) rather than blocking the
toolchain bump:

| Rule | Violations |
|---|---|
| `@typescript-eslint/no-explicit-any` | 43 |
| `@typescript-eslint/no-unused-vars` | 31 |
| `no-regex-spaces` | 10 |
| `no-empty` | 2 |
| `@typescript-eslint/no-require-imports` | 2 |
| `@typescript-eslint/no-empty-object-type` | 2 |
| `@typescript-eslint/no-unsafe-function-type` | (rare) |

Plus ~88 stale `// eslint-disable` directives that no longer match a reported
problem ("Unused eslint-disable directive").

**Trigger / how to apply:** a dedicated lint-cleanup PR — fix the violations
(prefer real types over `any`; remove dead code; `{2}` in regexes), drop the
stale disable comments, then flip each rule from `warn` → `error` in
`eslint.config.mjs`. Do it rule-by-rule so each is bisectable.

**Note:** `eslint-plugin-react` is intentionally **omitted** — its latest
release (7.37.5) uses the removed `context.getFilename()` API and crashes under
ESLint 10. A TypeScript app doesn't need its prop-types/display-name rules, and
`eslint-plugin-react-hooks` (which we do use) is a separate, ESLint-10-native
package. Revisit if/when eslint-plugin-react ships ESLint 10 support.

## Schema-drift testing — unify behind one `@intake/types` registry

**Deferred.** Post-split, the four "syncable table" lists (Dexie `.stores()`,
Drizzle `pgTable`s, `sync-topology` `TABLE_PUSH_ORDER`, `sync-payload` union)
are kept in parity by tests split across `packages/db` and `apps/web`. Unify
them behind a single generated registry in `@intake/types` so 100% of the
parity check becomes package-level. See proposal §13.1.

## zod 4 — clear deprecated APIs

**Deferred (2026-06-08, zod 3 → 4 migration).** zod 4 is fully adopted and the
suite is green, but several v4-**deprecated** (not removed) APIs still work with
identical behavior and were left in place to keep the bump focused:

- **`.flatten()` → `z.flattenError(err)`** — ~20 call sites (the shared
  `api/_shared/validation.ts` 400-helper, sync/push/settings/pull routes, AI
  routes, and client audit logging in the form cards). Output shape is identical
  (`{ formErrors, fieldErrors }`).
- **`z.string().url()` → `z.url()`** and **`z.string().email()` → `z.email()`** —
  mcp oauth routes, `push/subscribe`, `analytics-insights`, `api-keys/shares`.
  ⚠️ `z.url()` validation is **stricter** in v4 — re-check the
  `ai-insights-card` `javascript:`/`data:` scheme behavior when switching.
- Optionally tighten the migrated form schemas to the function-form
  `error: (issue) => issue.input === undefined ? "X is required" : "X must be a number"`
  to message wrong-type separately from missing (currently a single message,
  fine because the inputs are always `number | undefined`).

**Trigger:** a dedicated zod-deprecation cleanup PR.

## Phase 2 (`packages/db`) — migrator switch + boundary hardening

**Deferred (2026-06-12, `packages/db` extraction).** Phase 2 was scoped down to
a pure structural move (schema + Drizzle client + sync-payload → `@intake/db`,
migrations → `packages/db/migrations`, ~45 importers rewritten to the granular
`@intake/db/{client,schema,sync-payload}` subpaths). The boundary is enforced by
build-time `server-only` (the `@intake/db` barrel + `@intake/db/client` are
poisoned; the build fails if a client component pulls them). Deferred from the
proposal's full Phase 2:

- **Migrator switch** — keep `apps/web/scripts/migrate.ts` (drizzle-orm
  `neon-http` migrator, run by `vercel-build`), just re-pointed at
  `packages/db/migrations`, so prod-deploy behavior is **unchanged**. The
  proposal's `drizzle-kit migrate` + `DATABASE_URL_UNPOOLED` + decoupled
  `migrate-prod.yml` is its own follow-up (needs the unpooled endpoint
  provisioned; changes how prod migrations run). Owner chose to defer to shrink
  blast radius (2026-06-12).
- **`packages/db` lint task** — the 4 moved files are typechecked
  (`@intake/db#typecheck`) but no longer linted (they left `apps/web/src`). A
  package `lint` task wasn't added because the shared `@intake/eslint-config`
  base runs the deferred strict rules (e.g. `no-explicit-any`) at `error`, not
  the app's `warn`. **Trigger:** fold into the ESLint ratchet PR above (mirror
  the warn-downgrades or fix the files), then add `lint: eslint src` + an
  `eslint.config.mjs` to `packages/db`.
- **Boundary-scan hardening (§13.2 measures 4–6)** — lint-level layering via
  `dependency-cruiser`/`eslint-plugin-boundaries`, expanded `bundle-security`
  patterns, and scanning the Capacitor `out/` export. Primary enforcement
  (build-time `server-only`) is already active; these are earlier-feedback /
  defense-in-depth. **Trigger:** a boundary-hardening PR (the Capacitor export
  scan rides with the mobile milestone).
