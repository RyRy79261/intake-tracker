# Turborepo Monorepo Migration — Proposal

> **Status:** Proposal for review. No code has been changed. Authored on branch
> `refactor/turborepo-monorepo-plan`.
>
> **Goal:** Migrate the single-app, offline-first Next.js 16 PWA `intake-tracker`
> into a pnpm + Turborepo monorepo that **matches the convention already
> established by two sibling repos** — [`camp-404`](https://github.com/RyRy79261/camp-404)
> and [`ops-board`](https://github.com/RyRy79261/ops-board) — both of which were
> built off this stack. (camp-404's `packages/core/src/text-redaction.ts` and
> `shake.ts` are intake-tracker's own code, ported verbatim — so this is an
> *evolutionary* target, not a foreign one.)
>
> **Method:** 13 parallel recon agents (deep-dive of both reference repos, a
> per-layer decomposition of intake-tracker, and web research on Turborepo/Next 16
> best practices) + a synthesis pass, followed by direct verification of every
> load-bearing claim against the codebase. Every count and version in this doc was
> checked by hand.

---

## 1. TL;DR / Recommendation

Adopt the **exact `apps/* + packages/*` convention** from camp-404/ops-board:
packages `typescript-config`, `eslint-config`, `types`, `db`, `core`, `ui`,
`ai-prompts`; app `web` (+ `mobile` for the Capacitor shell). Internal packages
ship **raw TypeScript** (no build step) and are compiled by the Next app via
`transpilePackages`. Internal deps use `workspace:*`. No pnpm catalog (the refs
don't use one).

The migration is **not a clean clone of the refs** because intake-tracker's
architecture is *inverted*: it is **Dexie/IndexedDB-authoritative** on the client
with Drizzle/Neon as a downstream sync mirror. The refs are server-DB-first and
have **zero** Dexie / sync-engine / schema-parity precedent. So the plan
*extends* the convention: the Dexie store, the ~28 `*-service.ts` files, the sync
engine, the React-Query hooks, and the Zustand stores **stay in `apps/web`** —
they have no convention home, and that's correct.

Recommended sequencing: **land the breaking toolchain bumps first** (TS 6, ESLint
10 flat, Tailwind v4, zod 4 — all of which the refs already run and which the
shared config packages *structurally require*), **then** restructure. Doing the
bumps tangled with the move makes regressions unattributable.

**Three decisions are genuinely yours** (see §10): the package **scope name**, the
**toolchain appetite** (full bump now vs. defer), and the **`src/` layout** (keep
vs. flatten). The rest have clear recommendations baked into this doc.

---

## 2. Why a monorepo

You now run **three repos off one stack**. `intake-tracker` is the most mature, but
camp-404 and ops-board have already pulled ahead on tooling (Tailwind v4, zod 4,
TS 6, ESLint 10, Node 22) and have a cleaner package layout. Today, a shared fix
(a UI primitive, a redaction helper, an AI-prompt schema, a tsconfig tweak) has to
be hand-copied between three flat `src/` trees and drifts immediately — which is
exactly what already happened (`text-redaction.ts` lives in all three).

A monorepo gives you: one shared `ui`/`core`/`types`/`db`/`ai-prompts` surface,
one toolchain config (`typescript-config` + `eslint-config` packages), Turbo's
task graph + caching + affected-only CI, and a single place to evolve the
convention. The two reference repos prove the shape works for this stack.

---

## 3. The target convention (verified identical in both refs)

| Aspect | Convention | Notes |
|---|---|---|
| Layout | `apps/*` + `packages/*` | `pnpm-workspace.yaml` is 3 lines |
| Packages | `typescript-config`, `eslint-config`, `types`, `db`, `core`, `ui`, `ai-prompts` | camp-404 adds `telegram` (N/A here) |
| Scope | `@camp404/*`, `@opsboard/*` | single lowercase token → intake needs its own |
| Internal pkgs | `"type":"module"`, `"version":"0.0.0"`, `"private":true` | ship **raw `.ts`/`.tsx`** via `exports`, **no build, no tsup, no dist, no TS project references** |
| App consumes pkgs | `transpilePackages` in `next.config` | JIT compile-in-place |
| Internal deps | `workspace:*` | universal |
| External deps | caret `^` ranges, duplicated by hand | **no pnpm catalog**; exact-pin only `@neondatabase/auth`, `@modelcontextprotocol/sdk` |
| Layering rule | `types ← core ← ui ← apps`; `db` & `core` siblings on `types` | `core` must not import db/next/react/server-only/`process.env`/wall-clock |
| Drizzle | lives in `packages/db`; migrations at `packages/db/migrations/` | `db:generate`/`db:migrate` scripts on the db package |
| Root | thin: devDeps only `prettier`/`turbo`/`typescript`; scripts are `turbo run *` | `pnpm@10.33.0`, `node >=22` |
| `turbo.json` | `ui:"tui"`, `globalDependencies:["**/.env.*local",".env"]`, tasks build/dev/lint/typecheck/test/test:e2e/db:* | lint/typecheck `dependsOn:["^build"]` |
| React | `react`/`react-dom` are plain **dependencies** (not peer), pinned `^19.2.6` everywhere | this is how they avoid duplicate-React without a catalog |
| Absent in both | husky, commitlint, lint-staged, changesets, release-please | intake keeps its own — see §8 |

**`turbo.json` (ref shape, verbatim from camp-404):**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "globalDependencies": ["**/.env.*local", ".env"],
  "globalEnv": ["NODE_ENV", "DATABASE_URL", "..."],
  "tasks": {
    "build":       { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**", "out/**"] },
    "dev":         { "cache": false, "persistent": true },
    "lint":        { "dependsOn": ["^build"], "outputs": [] },
    "typecheck":   { "dependsOn": ["^build"], "outputs": [] },
    "test":        { "outputs": ["coverage/**"] },
    "test:e2e":    { "cache": false, "dependsOn": ["^build"] },
    "db:generate": { "cache": false },
    "db:migrate":  { "cache": false }
  }
}
```

---

## 4. The gap — intake-tracker's inverted architecture (verified)

The refs are server-DB-first; **intake-tracker is client-DB-first**. Verified
ground truth (correcting a couple of stale CLAUDE.md facts):

- **Dexie `DB_SCHEMA_VERSION = 21`** (`src/lib/db.ts:906`) — CLAUDE.md says 14; stale.
- `src/lib/db.ts` is **946 lines**, declares **22 exported interfaces**, and
  contains the `new Dexie()` runtime + all 21 version/upgrade blocks **in one
  file**. It is imported by **164 files** (`@/lib/db`).
- `src/db/schema.ts` has **33 `pgTable`/`pgSchema`** exports and **imports
  `server-only`**. Imported by **24 files** (`@/db/schema`); `@/lib/drizzle` by **21**.
- **zod is pinned to `"3"`**, with a forward-compat `import { z } from "zod/v4"`
  shim in `src/lib/sync-payload.ts:32`.
- Drizzle journal's latest entry is **`0017_potassium_intake_type when=1780800000000`
  = 2026-06-07 (today)** — the hand-dated migration footgun is at peak danger this week.
- **25** shadcn primitives in `src/components/ui/`; **210** total components; **28**
  `*-service.ts` files; `simple-statistics` used in exactly **1** file.

**Implication:** the client persistence layer (Dexie store, services, sync
engine, RQ hooks, Zustand stores) has no home in the convention and stays in
`apps/web`. Only the *types* it depends on, the *pure logic* it calls, and the
*server Drizzle schema* it mirrors get extracted.

---

## 5. Proposed target structure

```
intake-tracker/                      # root: private, name "intake-tracker", version 1.32.0 (single release unit)
├── package.json                     # thin: scripts = turbo run *; devDeps prettier/turbo/typescript; pnpm.overrides
├── pnpm-workspace.yaml              # ADD packages:[apps/*,packages/*]; PRESERVE the existing supply-chain block
├── turbo.json                       # NEW: ui:tui, globalEnv=all intake secrets, ref tasks + test:integration/coverage/mutation/bench
├── .npmrc .prettierrc.json .prettierignore   # ref shape; ignore packages/db/migrations
├── commitlint.config.js  .husky/    # STAY at root (intake-specific; refs lack these — keep)
├── release-please-config.json  .release-please-manifest.json   # single unit at "." = 1.32.0
├── AGENTS.md  CLAUDE.md             # root
├── .github/workflows/               # ci (turbo-native) + neon-pr-cleanup + migrate-prod(NEW) + codeql + commitlint + mutation + android-release + release-please
├── apps/
│   ├── web/                         # @intake/web — the Next 16 PWA  (Vercel Root Directory)
│   │   ├── src/ (or flattened)      #   app/ components/ hooks/ stores/ lib/
│   │   │   └── lib/                  #   db.ts (Dexie) + *-service.ts + sync-engine + mcp/* + AI route handlers STAY here
│   │   ├── next.config.mjs          #   withSerwist (ESM) + transpilePackages + turbopack.root pin + output:export gate
│   │   ├── tsconfig.json eslint.config.js postcss.config.mjs vercel.json
│   │   ├── playwright.config.ts vitest.config.ts vitest.integration.config.ts stryker.conf.json benchmarks/
│   │   ├── e2e/  public/            #   PWA manifest + sw assets
│   │   └── package.json             #   @intake/web; vercel-build="next build"; build:mobile="MOBILE_BUILD=1 next build"
│   └── mobile/                      # @intake/mobile — Capacitor 8 shell (camp-404 pattern)
│       ├── capacitor.config.ts      #   webDir = ../web/out
│       ├── android/                 #   moved from repo-root android/
│       └── package.json             #   build:native = filter @intake/web build:mobile && cap sync
└── packages/
    ├── typescript-config/           # base/nextjs/react-library/node.json (files[], no main)
    ├── eslint-config/               # flat index.js + next.js  (PORT the no-restricted-imports boundary rules)
    ├── types/                       # 22 Dexie record interfaces + enums + sync-topology + shared zod schemas (zod v4) — dep ROOT
    ├── db/                          # Drizzle schema (server-only) + migrations/ + drizzle.config + drizzle-zod payloads + journal/parity tests
    ├── core/                        # pure I/O-free logic (analytics-stats, alcohol-units, compound/progress utils, text-redaction, settings migrate)
    ├── ui/                          # 25 shadcn primitives (flat) + ~8 generic widgets + globals.css @theme (Tailwind v4) + cn
    └── ai-prompts/                  # prompt consts + pinned model ids + PROMPT_VERSIONS (depends @intake/types for shared parse schemas)
```

---

## 6. Per-package breakdown

| Package | What lands here (from today's tree) | Internal deps | Notable external | Headline risk |
|---|---|---|---|---|
| **typescript-config** | `tsconfig.json` compilerOptions → base/nextjs/react-library/node; add `exactOptionalPropertyTypes:true` (intake is stricter than ref base) | — | — | TS 5.6→6 + Bundler resolution surfaces new errors across all packages |
| **eslint-config** | rewrite `.eslintrc.js` (ESLint 8) → ESLint 10 flat; **port the `no-restricted-imports` boundary rules** (ban `@/lib/db`, `@/lib/*-service`, relative-import bans, 5 folder overrides) | — | `typescript-eslint ^8`, peer `eslint ^10` | Boundary rules are load-bearing for the architecture; mis-port silently re-permits cross-layer imports. **Biggest tooling lift.** |
| **types** | the 22 interfaces + enums split out of `db.ts`; `sync-topology`, `service-result`, history/analytics/voice types; shared AI zod schemas | — | `zod ^4` | The interfaces + `new Dexie()` runtime are entangled in one 946-line file imported by 164 files — splitting cleanly is invasive |
| **db** | `src/db/schema.ts` (server-only); `src/lib/drizzle.ts`→`index.ts`; `drizzle/`→`migrations/` (byte-identical); `scripts/migrate.ts`; drizzle-zod sync payloads; journal + parity tests | `@intake/types` | `drizzle-orm ^0.45.2`, `@neondatabase/serverless ^1.1.0` | **`server-only` leak via `sync-payload.ts`** + the **migration timestamp footgun** travelling with the journal |
| **core** | `analytics-stats`/`insights`/`registry`, `alcohol-units`, `compound-utils`, `progress-utils`, `settings-helpers`, pure `text-redaction` from `security.ts`, `createShakeDetector`, pure `migrateSettings` | `@intake/types` | `zod ^4`, `simple-statistics` (new core dep) | **Wall-clock purity wall** — date/tz/medication-builder code reads `Date.now()`; needs injected `now`/`tz` |
| **ui** | `src/components/ui/*` (25, flattened) + ~8 generic widgets; `use-toast`/`use-now-tick`; `cn` from `lib/utils`; `globals.css` token block → v4 `@theme` | `@intake/core` | react/react-dom (deps, not peer), `cva`, `lucide ^1.16`, `tailwind-merge ^3.6`, radix | **Tailwind v3→v4 rewrite** (touches token usage repo-wide); `@source` directive is silent-on-failure |
| **ai-prompts** | inline system prompts + tool defs + `CLAUDE_MODELS` registry from ~10 `api/ai/**` routes; `PROMPT_VERSIONS` | `@intake/types` | — | Must NOT pull `@anthropic-ai/sdk`/crypto/DB into consumers — keep SDK/key/usage code in `apps/web` |

**Stays in `apps/web` (no package home — correct):** `lib/db.ts` (Dexie), all
`*-service.ts`, the sync engine + queue, every React-Query hook, the Zustand
stores + `QueryClient` singleton, AI route handlers + SDK client + key vault +
usage tracker, the MCP handler, `next-themes` glue, PWA/serwist, middleware.

---

## 7. Version reconciliation — adopt the ref stack

Half-matching is worse than fully adopting: the shared `eslint-config`/`typescript-config`
packages structurally require the ref toolchain (eslint-config peer is `eslint ^10`;
base tsconfig assumes TS 6 Bundler resolution; the `ui` package is Tailwind-v4-only).

| Dep | intake now | TARGET | Why |
|---|---|---|---|
| pnpm | 10.30.2 | **10.33.0** | match refs (exact-pin) |
| node engines | >=20.9.0 | **>=22** | refs + CI |
| typescript | ^5.6.3 | **^6.0.3** | base tsconfig assumes it |
| eslint | ^8.57.1 (.eslintrc.js) | **^10.4.0 flat** | shared eslint-config peer |
| tailwindcss | ^3.4.14 | **^4.3.0** (`@theme`/`@source`) | ui package is v4-only |
| zod | 3 (+ `zod/v4` shim) | **^4.4.3** | types/core/ai-prompts are zod 4 |
| lucide-react | ^0.454.0 | **^1.16.0** | ui convention |
| tailwind-merge | ^2.5.4 | **^3.6.0** | ui convention |
| @neondatabase/auth | 0.2.0-beta.1 | **0.4.1-beta** (exact) | ref pin; verify session shape |
| @neondatabase/serverless | ^1.0.2 | **^1.1.0** | camp-404 (newer ref) |
| @anthropic-ai/sdk | ^0.91.1 | **^0.98.0** | ref; re-verify tool-use flow |
| @modelcontextprotocol/sdk | 1.26.0 | **1.26.0** (exact) | already matches |
| drizzle-orm / kit | ^0.45.2 / ^0.31.10 | **unchanged** | already match |
| next / react | 16.2.6 / ^19.2.6 | **^16.2.6 / ^19.2.6** | caret to match ref style |

**Keep intake-specific divergences the refs have no precedent for:** `next.config`
stays `.mjs` (serwist `withSerwist` is ESM-only), Capacitor env renamed
`CAPACITOR_BUILD`→`MOBILE_BUILD` (align to ref), and the supply-chain/audit block
stays in `pnpm-workspace.yaml`.

---

## 8. Tooling & CI/CD

**`turbo.json`** — copy the ref shape; `globalEnv` **must** enumerate every intake
secret (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_*`, `ANTHROPIC_API_KEY`,
`GROQ_API_KEY`, `ALLOWED_EMAILS`, `CRON_SECRET`, `VAPID_*`, `MOBILE_BUILD`,
`NEON_API_KEY`/`NEON_PROJECT_ID`, `NEXT_PUBLIC_*`) or Turbo strips them and the
cache key is wrong. Add intake-only tasks the refs lack: `test:integration`
(`cache:false` — spins Docker), `test:coverage`, `test:mutation`, `bench`.

**Test orchestration** — all test infra moves to `apps/web` (it's app-coupled and
there's one app): vitest unit (coverage ratchet), vitest integration
(`@testcontainers/postgresql`), Playwright e2e (Neon-Auth global-setup), Stryker,
benchmarks. **Schema-parity / drift testing is split** (see §13.1): the
`@intake/types` ↔ Drizzle-schema parity test + the journal-monotonicity test live in
`packages/db` (enforced by `@intake/db`'s own `test` task); the Dexie-runtime parity
(live `.stores()` ↔ `@intake/types`) and the four-list set-equality test stay in
`apps/web` because the Dexie runtime can't leave the app.

**The 7 GitHub workflows:**
1. **ci.yml** — rewrite turbo-native (camp-404 is the structural match: paths-filter
   + remote cache + e2e + ephemeral-Neon). Add `TURBO_TOKEN`/`TURBO_TEAM`; re-point
   the drizzle-drift check at `packages/db/migrations/`; **preserve all intake-only
   jobs** (gitleaks/dependency-review, codeql, mutation, benchmark, integration,
   coverage, tz-matrix, supply-chain grep, ci-pass aggregate) with updated path filters.
2. **neon-pr-cleanup.yml** — unchanged (already byte-identical to camp-404's).
3. ~~**migrate-prod.yml (NEW)**~~ **🛑 SUPERSEDED (2026-06-14) — see §13.3.** Keep
   `scripts/migrate.ts` in `vercel-build` (Vercel migrates the per-PR Neon preview
   branch *and* prod); a `push:main`-only workflow would leave preview branches
   un-migrated. No `migrate-prod.yml`, no `DATABASE_URL_UNPOOLED` secret.
4. **codeql.yml** — works unchanged.
5. **commitlint.yml** — unchanged (husky stays at root).
6. **mutation.yml** — `pnpm --filter @intake/web test:mutation`; re-point baseline paths.
7. **android-release.yml** — **keep the working Play pipeline** (signed AAB/APK,
   keystore-from-secret, `r0adkll/upload-google-play` with track selection, Play App
   Signing) — it's already app-store-grade and ahead of the refs. Only re-root paths
   to `apps/mobile/...`, replace the `node scripts/cap-build.js` step with
   `pnpm --filter @intake/mobile build:native`, and keep version derivation from root
   `package.json`. **Android / Google Play only** (iOS deferred). See §13.4.

**Vercel** — Root Directory = `apps/web` (dashboard); Build Command `turbo run build`;
enable the **Skip-unaffected-projects** toggle (2026 pattern — no concurrent-build-slot
cost, unlike in-repo `turbo-ignore`). Vercel-Neon env names are injected at project
level and are unaffected by the move.

**release-please** — stays **single-package** at root `1.32.0`
(`packages:{".":{}}`, `release-type node`). `NEXT_PUBLIC_APP_VERSION` and the Android
`versionCode = major*10000+minor*100+patch` both derive from one semver; per-package
would break that. Deviates from the refs' `version:0.0.0` (they don't release) but is
correct here.

---

## 9. Phased migration plan

Each phase ends green on the full suite and is independently revertable.

| Phase | Goal | Key steps | Risk |
|---|---|---|---|
| **0 — Toolchain pre-bump + boundary hardening** (still single-app) | Land the breaking version bumps in isolation so each is bisectable; close the unguarded server surfaces while the tree is still flat | pnpm/node/TS bump → fix type errors; **zod 3→4** repo-wide (drop the `zod/v4` shim); **ESLint 8→10 flat** (port boundary rules); **Tailwind v3→v4** (`@theme`/`@source`/`@custom-variant`, preserve water/salt/etc. tokens; lucide→1.16, tailwind-merge→3.6); bump neon-auth/anthropic/serverless + re-verify auth & AI flows; **add `import "server-only"` to the ~8 unguarded server `lib/*` modules + `import "client-only"` to Dexie `db.ts`** (§13.2); full suite green | **HIGH** — 4 breaking migrations, but isolated → attributable |
| **1 — Monorepo scaffold** | Stand up Turbo skeleton + the two zero-risk config packages | move tree under `apps/web`; add `pnpm-workspace.yaml` (preserve supply-chain block) + root `turbo.json` + thin root package.json; create `typescript-config` + `eslint-config`; add (empty) `transpilePackages` + `turbopack.root` pin; verify `turbo run build/lint/typecheck/test`; set Vercel Root Directory | **MEDIUM** — the `src/` keep-vs-flatten decision drives churn |
| **2 — packages/db** | Move the strongly-precedented server layer | `schema.ts` → `packages/db` (keeps server-only); **`import "server-only"` in the package barrel** + a client-safe `@intake/db/sync-payload` export that does not pull the server schema; `drizzle.ts`→`index.ts` (factory + back-compat `db` proxy); `drizzle/`→`migrations/` **byte-identical**; **retire `scripts/migrate.ts` → `drizzle-kit migrate` + `DATABASE_URL_UNPOOLED`** (preview-validated, §13.3); add package-level `@intake/types`↔Drizzle parity test + journal test; rewrite 45 importers; wire CI db-filter | **HIGH** — client-bundle boundary + migrator switch converge here |
| **3 — packages/types + core** | The layering spine | split 22 interfaces out of `db.ts` (Dexie runtime stays in app); move pure logic to `core`; **refactor wall-clock readers to injected `now`/`tz`**; ship strict purity test; rewrite importers; keep all hooks/stores/QueryClient in app | **MED-HIGH** — db.ts split touches 164 importers |
| **4 — packages/ui + ai-prompts** | Additive, lower-coupling extractions | flatten 25 primitives + ~8 widgets into `ui`; move `globals.css` v4 `@theme` + `@source`; keep Outfit `next/font` in `apps/web/layout.tsx` (never in a package); keep `next-themes` app-side; extract prompts/tools/model-ids into `ai-prompts` | **MEDIUM** — mostly mechanical (Tailwind done in P0); verify `@source` + `"use client"` survive |
| **5 — CI/CD finalize + mobile scaffold** | Finish the turbo-native workflows; stand up the clean mobile shell | finalize turbo-native `ci.yml` (preserve all intake-only jobs); ~~add decoupled `migrate-prod.yml`~~ (**🛑 dropped — see §13.3; migrations stay in `vercel-build`**); enable Vercel skip-unaffected; **scaffold `apps/mobile` in the clean camp-404 shape** (webDir `../web/out`, `MOBILE_BUILD=1 next build` gating `output:export`, **no `cap-build.js` hack**) | **MEDIUM** — structural; the full Play-Store mobile rebuild is its own milestone |
| **M — Mobile rebuild (dedicated milestone)** | Ship the Android app properly to Google Play | `cap add android` fresh; keep `@capacitor/local-notifications`; re-root + harden `android-release.yml` (keep the Play pipeline); bundle-security scan the shipped `out/` export; Play service-account + store listing; validate the export build end-to-end | **HIGH** — first proper store release; see §13.4 |

---

## 10. Decisions

**Locked (confirmed by owner, 2026-06-07):**

1. **Package scope → `@intake`.** Every package is `@intake/<name>` (`@intake/ui`,
   `@intake/db`, `@intake/core`, `@intake/types`, `@intake/ai-prompts`,
   `@intake/eslint-config`, `@intake/typescript-config`, `@intake/web`, `@intake/mobile`).
2. **Toolchain → full adoption in Phase 0.** Bump to the ref stack (TS 6 / ESLint 10
   flat / Tailwind v4 / zod 4 + the dependency targets in §7) before restructuring.
3. **`src/` layout → keep `apps/web/src/` with `@/* → ./src/*`.** Move the tree
   wholesale; a documented, deliberate divergence from the refs' no-`src` layout.
4. ~~**Migrator → standard `drizzle-kit migrate` + `DATABASE_URL_UNPOOLED`** in a
   decoupled `migrate-prod.yml`; retire `scripts/migrate.ts`.~~ **🛑 REVERSED
   (2026-06-14) — see §13.3.** Keep `scripts/migrate.ts` in `vercel-build`: Vercel
   provisions a Neon branch DB per preview deploy, so migrations must run in the
   build (a decoupled prod-only workflow would skip preview branches).
5. **App-store target → Android / Google Play only** for now; keep the existing Play
   pipeline, structure `apps/mobile` so iOS can be added later (§13.4).
6. **Boundary hardening → in scope.** Add `server-only`/`client-only` tripwires to the
   unguarded surfaces + lint-level layering + harden the bundle scan (§13.2).
7. **Schema-drift testing → split + deferral ticket.** Package-level where possible
   now; file a ticket to unify behind one `@intake/types` registry later (§13.1).

**Recommended defaults (will proceed unless you object):**

- **sync-payload schemas** — expose a client-safe `@intake/db/sync-payload` export that
  does not pull `server-only` (settle concretely in Phase 2).
- **next-themes** — keep app-side (don't migrate to the refs' NeonAuth class pattern).
- **core purity** — ship the strict purity test; absorb the `now`/`tz` injection churn.
- **DB integration suite** — stays in `apps/web` for v1.
- **ai-prompts shape** — ops-board's types-dependent variant (lockstep schema test).
- **release-please** — single-package at root `1.32.0`.
- **Storybook** — defer to a follow-up (not load-bearing for the migration).

---

## 11. Top risks (verified)

1. **Preserving (and extending) the server/client boundary.** The code is currently
   clean — `schema.ts` + `user-data-deletion.ts` carry `server-only`, the client sync
   engine uses isomorphic `sync-topology` (not `sync-payload`), and `migration-service`
   imports `sync-payload` as `import type` only. The risk is the mechanical move snipping
   one of those guards (dropping `server-only`, flipping a type-only import to a value
   import, co-locating client-safe + server code). Compounding this: an audit found
   **~8 server `lib/*` modules with no tripwire at all** (incl. `drizzle.ts` — the Neon
   connection — `auth-middleware`, `push-db`, `push-sender`, `ai-key-resolver`,
   `claude-client`, `mcp/whitelist`). Mitigation in §13.2 (add tripwires, poison the
   `@intake/db` barrel, lint-level layering, harden the bundle scan, scan the mobile export).
2. **Drizzle migration timestamp footgun (now past the crossover).** Journal
   `0017 when=1780800000000` = today; earlier migrations (0006–0017) carry hand-edited
   future-dated `when` values. A migration generated *before* the real clock caught up
   would sort below the fake and be silently skipped while the migrator prints success.
   The real clock has now ≈ caught up, so it self-heals **provided `_journal.json` is
   never hand-edited again** and only `drizzle-kit generate` writes `when`. The migrator
   switch is orthogonal (both read the same journal). Mitigation: move migrations
   byte-identical, decouple via `migrate-prod.yml`, and **verify the next prod migration
   actually applies** (check `__drizzle_migrations`).
3. **`db.ts` interface/runtime entanglement** — 22 interfaces + `new Dexie()` + 21
   upgrade blocks in one 946-line file, imported by 164 files. Prerequisite for both
   the types and core extractions.
4. **Four bundled breaking toolchain migrations** (TS 6, ESLint 10 flat, Tailwind v4,
   zod 4). Phase 0 isolates them, but each is independently high-risk.
5. **Tailwind v4 `@source` is load-bearing and silent on failure** — omit it in the
   `ui` package and CVA-baked utilities (`bg-water`, `bg-salt`) vanish from the app
   build with no error.
6. **Capacitor build hack (being retired).** `scripts/cap-build.js` does an
   `fs.renameSync` stash of `api/` + `middleware.ts` to force a clean static export — a
   crashed build orphans the `.bak`. This is **burned** and replaced by the camp-404
   pattern (`MOBILE_BUILD=1 next build` gating `output:export`, no rename). The
   *release* pipeline (`android-release.yml`) is **kept** and re-rooted — it's already
   app-store-grade. Residual risk: validating the export build end-to-end and the first
   proper Play release (its own milestone, §13.4).
7. **JIT packages can't use tsconfig `paths`** — every `@/` deep import that lands
   inside a package must become relative or fail to resolve.

---

## 12. Appendix — verification log

Claims in this doc were checked directly against the working tree (not taken from
agent output alone):

| Claim | Verified |
|---|---|
| Dexie `DB_SCHEMA_VERSION` | **21** (`db.ts:906`); CLAUDE.md "14" is stale |
| `db.ts` size / exported interfaces / Dexie runtime | 946 lines / 22 / 3 `new Dexie`/extends |
| `@/lib/db` importers | **164** (exact) |
| `@/db/schema` / `@/lib/drizzle` importers | **24** / **21** |
| `schema.ts` `server-only` + pgTable count | imports server-only; **33** pgTable/pgSchema |
| zod version + shim | `"3"` + `import { z } from "zod/v4"` (`sync-payload.ts:32`) |
| journal latest entry | `0017_potassium_intake_type when=1780800000000` (2026-06-07) |
| ui primitives / total components / services | **25** / **210** / **28** |
| Reference repos use Dexie/IndexedDB | **No** — zero matches in either repo |
| camp-404 ported from intake | `core/src/text-redaction.ts`, `shake.ts` are intake's code |
| custom `migrate.ts` uses | `drizzle-orm/neon-http/migrator` (HTTP driver, not Dexie-related) |
| server-only tripwire coverage | **2** files guarded; **~8** server `lib/*` modules unguarded |
| `client-only` guard | **none** in the codebase |
| syncable-table lists to keep in lockstep | **4** (Dexie stores, Drizzle, `TABLE_PUSH_ORDER`, `sync-payload` union) |

---

## 13. Discussion outcomes & hardening plan (2026-06-07)

Captures the risk deep-dive and the decisions made from it.

### 13.1 Schema-drift testing

The "list of syncable tables" is currently duplicated in **four** places that must
stay identical: the Dexie `.stores()` runtime (`apps/web`), the Drizzle `pgTable`s
(`packages/db`), `sync-topology.ts`'s `TABLE_PUSH_ORDER` (`packages/types`), and the
`sync-payload.ts` discriminated union (`packages/db`). Only one parity test guards
this today.

- **Package-level (new, in `packages/db`):** `@intake/types` ↔ Drizzle-schema parity
  (field/table presence) + journal-monotonicity. Both inputs are importable within the
  package (`db` depends on `types`), so this is a true `@intake/db` `test`-task gate.
- **App-level (stays in `apps/web`):** live Dexie `.stores()` ↔ `@intake/types`, plus a
  new **four-list set-equality** test. The Dexie *runtime* is the client source of
  truth and can't leave the app.
- **Deferral ticket:** unify all four behind a single generated registry in
  `@intake/types` so 100% becomes package-level. Track in a `DEFERRED.md`
  (camp-404 convention) or a GSD ticket.

### 13.2 Server/client boundary hardening

Audit result: only `schema.ts` and `user-data-deletion.ts` carry `import "server-only"`;
**~8 server `lib/*` modules have no tripwire** (`drizzle.ts`, `auth-middleware.ts`,
`push-db.ts`, `push-sender.ts`, `ai-key-resolver.ts`, `mcp/whitelist.ts`,
`api/ai/_shared/claude-client.ts`, `ai-error-response.ts`). `route.ts` handlers are safe
(Next never bundles them client-side). No `client-only` guard exists anywhere.

Measures (land tripwires in Phase 0 while flat; rest through the move):
1. `import "server-only"` on the ~8 unguarded server `lib/*` modules.
2. `import "client-only"` on Dexie `db.ts` (symmetric — can't be pulled server-side).
3. Poison the `@intake/db` barrel with `server-only`; client gets types from
   `@intake/types` + the client-safe `@intake/db/sync-payload` export only.
4. Lint-level layering — extend `no-restricted-imports` (already bans `@/lib/db` in
   places) to ban the server entry from `components/hooks/stores`; add
   `dependency-cruiser`/`eslint-plugin-boundaries` to enforce `types←core←ui←app` at
   lint time.
5. Harden `bundle-security.test.ts` — it currently `skipIf(!hasBuildArtifacts)`, so it
   silently no-ops with no build. Make CI guarantee the build ran; expand patterns
   (`drizzle-orm/neon-http`, `pgTable`, neon hostnames).
6. **Scan the Capacitor `out/` export too** — that JS ships *inside the installed app*
   to users' devices; a leak there is permanent and public. Highest-stakes surface.

### 13.3 Migrator switch (why, and how safely)

> **🛑 SUPERSEDED (2026-06-14) — do NOT implement this. It is an anti-pattern for
> this project's Vercel↔Neon setup; `scripts/migrate.ts` stays in `vercel-build`.**
>
> The decoupled `migrate-prod.yml` (a `push:main` GitHub workflow running
> `drizzle-kit migrate`) was inspired by the ops-board sibling, but it only
> migrates **prod, after merge**. The Vercel–Neon integration provisions a **Neon
> branch DB per preview deployment** (forked from prod's schema; a PR's new
> migrations are the delta). Only that PR's **`vercel-build`** (`pnpm db:migrate &&
> next build`) can apply those migrations to that preview branch during the deploy —
> a `push:main` workflow never touches preview branches, so previews would run
> against an un-migrated schema, and it is redundant with `vercel-build`'s prod
> migration. (Corroboration in-repo: `neon-pr-cleanup.yml` deletes a
> `preview/<head>` branch per PR; CI's e2e / schema-migration jobs migrate their own
> ephemeral Neon branches via `pnpm db:migrate`.)
>
> **Decision: keep `apps/web/scripts/migrate.ts` (neon-http over the pooled
> `DATABASE_URL`, run by `vercel-build`) — Vercel manages migrations for preview AND
> prod. No `migrate-prod.yml`, no `DATABASE_URL_UNPOOLED` secret.** The migrate.ts
> timestamp footgun (§11.2) stays but is dormant (past the crossover; self-heals as
> long as `_journal.json` is never hand-edited). The original §13.3 rationale below
> is retained for history only. This also supersedes §10 decision 4, §8 item 3, and
> the migrate-prod parts of the Phase 5 row in §9.

`scripts/migrate.ts` is custom **only because of the Neon connection method** — it
migrates over the `drizzle-orm/neon-http` HTTP driver (the same driver the app uses at
runtime). It has nothing to do with Dexie. `drizzle.config.ts` notes drizzle-kit 0.31
dropped the neon-http option, so `drizzle-kit migrate` connects via a normal Postgres
**TCP session**.

- **Decision:** retire the custom script; use standard **`drizzle-kit migrate` against
  `DATABASE_URL_UNPOOLED`** (Neon's direct endpoint — the pooled `DATABASE_URL` runs
  through PgBouncer transaction mode, which is unsafe for transactional DDL / advisory
  locks). This matches ops-board and removes bespoke code.
- **Safety:** both migrators share the same `__drizzle_migrations` table + journal
  hashing, so no history re-apply — but **validate once on a Neon preview branch** that
  the existing history is recognized before pointing it at prod.
- **Orthogonal to the footgun** (§11.2): the journal timestamps are read identically by
  either migrator.

### 13.4 Mobile rebuild — dedicated milestone (Android / Play)

**Keep, don't burn, the release pipeline.** intake's `android-release.yml` is already
app-store-grade and *ahead of camp-404* (which has no release workflow): signed
AAB+APK, keystore-from-secret, `r0adkll/upload-google-play` with track selection,
GitHub-release artifacts, Play App Signing, plus `generate-upload-keystore.sh` +
`docs/android-release.md`.

**Burn only the build hack.** Replace `scripts/cap-build.js` (the `fs.renameSync` stash)
and the root `capacitor.config.ts`/`android/` with the camp-404 shape:
- a tiny `apps/mobile` package: `capacitor.config.ts` (`webDir → ../web/out`),
  `package.json` (`build:native = "pnpm --filter @intake/web build:mobile && cap sync"`),
  `tsconfig`, `eslint`;
- `apps/web`: `build:mobile = "MOBILE_BUILD=1 next build"` with `output:"export"` gated
  on `MOBILE_BUILD` in `next.config` (no rename);
- re-add the native project fresh via `cap add android`;
- keep `@capacitor/local-notifications` (offline medication reminders — the reason
  Capacitor beats a web-only wrapper).

**Make it proper for the store:** validate the `output:export` build end-to-end (Next 16
may need a `MOBILE_BUILD` guard to skip dynamic route handlers), wire the Play
service-account secret, the store listing (privacy policy already exists via the
`/privacy` + `/data-deletion` pages), and run the bundle-security scan against `out/`.

**Scope:** Android / Google Play only now. `apps/mobile` is structured so iOS (App
Store) can be added later — needs an Apple Developer account, macOS runners,
provisioning, and a fastlane upload lane.

> Reference repos cloned to `/tmp/mono-ref/{camp-404,ops-board}` for analysis.
> Recon: 13 parallel agents + synthesis (~1.2M tokens). Full agent dossier
> available in the workflow transcript.
