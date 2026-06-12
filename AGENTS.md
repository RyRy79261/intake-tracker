# AGENTS.md

Guidance for AI agents and contributors working in this repository. The
primary project guide — architecture, commands, conventions — is **`CLAUDE.md`**;
read it first. This file highlights footguns that are easy to trip over.

## Database migrations — read before generating one

The server schema (`src/db/schema.ts`) is mirrored to Neon Postgres through
numbered Drizzle migrations in `drizzle/`. Generate with `pnpm db:generate`,
apply with `pnpm db:migrate`. Never run `drizzle-kit push`.

`@intake/db/schema` (`packages/db/src/schema.ts`) must stay field-for-field in
parity with the Dexie record interfaces in `@intake/types/records`
(`packages/types/src/records.ts`) — `apps/web/src/__tests__/schema-parity.test.ts`
fails the build otherwise.

### The timestamp footgun

drizzle's migrator applies a migration only when its journal `when` exceeds
the highest `created_at` already recorded in the target database's
`__drizzle_migrations` table. Migrations 0006–0010 carry **hand-edited
future-dated `when` values** (up to `1780100000000` ≈ 2026-05-29) — a
pre-existing wart (see commit `7935991`).

- **Until ≈ 2026-05-29:** a freshly generated migration gets a real
  `Date.now()` that sorts *below* those fakes, so the migrator silently skips
  it — while still printing "Migrations applied successfully". Hand-bumping
  the new entry's `when` in `drizzle/meta/_journal.json` above the last entry
  may be unavoidable. Do it only when necessary, and never lower an existing
  entry (deployed databases already recorded the old value).
- **After ≈ 2026-05-29:** real generated timestamps exceed every deployed
  migration on their own. **Never hand-edit `drizzle/meta/_journal.json`** —
  let `drizzle-kit generate` write `when`.

`src/__tests__/migration/drizzle-journal.test.ts` enforces this: `when` must
strictly increase, and once wall-clock passes the cutoff the build fails on
any future-dated (hand-written) entry.
