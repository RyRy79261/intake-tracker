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
