# Stack Research

**Domain:** Health tracking PWA — medication management + engineering overhaul
**Researched:** 2026-03-02
**Confidence:** HIGH (core additions verified via official docs / npm / Context7), MEDIUM (Dexie Cloud sync patterns), LOW (NanoDB — could not identify a specific library matching project intentions)

---

## Existing Stack (Do Not Change)

These are established and must not be replaced. Research focused on additions only.

| Technology | Version (current) | Role |
|------------|-------------------|------|
| Next.js | 14.2.15 | App framework (App Router) |
| Dexie.js | 4.0.8 | IndexedDB wrapper |
| dexie-react-hooks | 1.1.7 | Reactive Dexie queries in React |
| Zustand | 5.0.0 | Settings persistence (localStorage) |
| React Query (@tanstack/react-query) | 5.90.20 | Async data caching/invalidation |
| shadcn/ui + Radix UI | various | UI component system |
| Tailwind CSS | 3.4.14 | Styling |
| Privy | 3.12.0 | Auth |
| Recharts | 2.15.4 | Charts |
| Zod | 3.x | Schema validation |
| date-fns | 4.1.0 | Date utilities |
| Playwright | 1.58.2 | E2E testing |

---

## Recommended Additions

### Testability Layer

The project has Playwright for E2E but **zero unit/integration test infrastructure**. Service functions (medication-service.ts, dose-log-service.ts) and data utilities have no test coverage. This is the highest-risk gap during an engineering overhaul.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| vitest | ^4.x (latest: 4.0.18) | Unit/integration test runner | Official Next.js recommendation; Vite-native so no separate bundler config; Jest-compatible API means low migration cost; 14x faster than Jest on cold starts |
| @vitejs/plugin-react | ^4.x | React JSX transform for Vitest | Required by Next.js Vitest setup; official recommendation |
| jsdom | ^26.x | Browser environment for Vitest | Required for React Testing Library in Node; lighter than happy-dom for this use case |
| @testing-library/react | ^16.x | Component unit tests | Only use for testing service-layer hooks; E2E (Playwright) handles full UI flows |
| @testing-library/dom | ^10.x | DOM utilities | Required peer of @testing-library/react |
| vite-tsconfig-paths | ^5.x | Respects `@/*` path alias in tests | Without this, `@/lib/db` imports fail in Vitest; officially documented by Next.js |
| fake-indexeddb | ^6.2.5 | In-memory IndexedDB for unit tests | Standard pattern for testing Dexie services in Node; pure JS, no native deps; version 6.2.5 achieves 2025 Web Platform Test coverage |

**What to test with Vitest:** Service functions (medication-service, dose-log-service, health-service), Dexie schema migration logic (version upgrades), date utilities, business logic. Vitest does NOT support async Server Components — use existing Playwright for those.

**What NOT to test with Vitest:** Full page flows (Playwright handles these), server-side API routes with real I/O (integration test pattern needed), complex UI interaction sequences.

### TypeScript Strictness Upgrades

Current `tsconfig.json` has `"strict": true` but is missing two additional checks that would catch real bugs in a health app where undefined handling is safety-critical.

| Flag | Default | Recommended | Why |
|------|---------|-------------|-----|
| `noUncheckedIndexedAccess` | false | **true** | Adds `\| undefined` to all array/object index access. Without this, `records[0].timestamp` compiles fine even when array might be empty — a real bug risk in query results. TypeScript 5.9 now recommends this in tsc --init. |
| `exactOptionalPropertyTypes` | false | **true** | `field?: string` means absent-only, not `field: string \| undefined`. Catches accidentally assigning `undefined` to an optional field. Matters for Dexie schema types where absent vs explicitly undefined has different IDB behavior. |

**Migration cost:** Enabling both flags will surface ~50-200 TypeScript errors in an existing codebase. This is intentional — these are latent bugs to be fixed during the overhaul. Do not suppress them; fix them.

### Zod — Stay on v3 for Now

The project uses `zod: "3"` (pinned to major version 3). Zod v4 was released August 2025 with 14x faster parsing, ~57% smaller bundle, and significant API changes (e.g. `z.string().email()` → `z.email()`).

**Recommendation: Stay on Zod 3 during this milestone.** Rationale:

- Zod v4 is available at the `"zod/v4"` subpath alongside `zod@3.25+`, meaning both can coexist
- Ecosystem compatibility (react-hook-form, tRPC, other libs) is still catching up to v4
- Breaking changes (`.strict()` → `z.strictObject()`, record requiring two args, optional field behavior) require audit before adoption
- The engineering overhaul goal is stability, not dependency upgrades

**If upgrading:** Target `zod@^3.25` first (which bundles v4 as a subpath) and migrate incrementally via `import { z } from "zod/v4"`.

### React Query DevTools

Already using React Query 5. Add devtools for development visibility into cache state — especially important when adding cross-domain queries for medication + health correlation.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @tanstack/react-query-devtools | ^5.91.3 | Dev-time query inspection | Auto-excluded from production bundles (NODE_ENV guard); shows cache state, stale queries, mutation history; critical for debugging cross-domain query invalidation chains |

### Dexie Indexing Additions (Schema-Level, Not New Libraries)

The current schema is missing compound indexes that will be needed for efficient cross-domain querying. These are schema changes, not library additions, but they need to be planned now.

**Current problem:** Queries like "all dose logs for a prescription in a date range" or "inventory transactions for an item in the last 7 days" require full table scans because only single-field indexes exist.

**Add compound indexes in next schema version:**

```typescript
// Current (version 9):
doseLogs: "id, prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status"
inventoryTransactions: "id, inventoryItemId, timestamp"

// Required additions (version 10+):
doseLogs: "id, prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status, [prescriptionId+scheduledDate], [status+scheduledDate]"
inventoryTransactions: "id, inventoryItemId, timestamp, [inventoryItemId+timestamp]"
intakeRecords: "id, type, timestamp, source, [type+timestamp]"  // cross-domain: fluid vs urination
```

**Compound index rules in Dexie (verified from official docs):**
- Syntax: `"[field1+field2]"` in `.stores()` definition
- Queries: use `.where("[field1+field2]").equals([val1, val2])` or `.between([v1a, v2a], [v1b, v2b])`
- Limitation: compound indexes cannot be used with `.orderBy()` in Dexie — sort separately after filtering
- These are purely additive schema changes (new indexes, no data migration needed)

### Dexie Cloud Sync Preparation (Schema Constraints)

**"NanoDB" in the PROJECT.md is ambiguous.** Web search found no established library named "NanoDB" for browser sync. The most likely intent is **Dexie Cloud** (official sync addon from the Dexie team), which is the dominant cloud sync solution for Dexie apps.

**Dexie Cloud constraints that affect the data model NOW (even before cloud sync is activated):**

1. **UUID primary keys are sync-safe.** The current schema uses `crypto.randomUUID()` for all IDs — this is correct. Dexie Cloud requires globally unique IDs (UUIDs satisfy this). Do NOT change to auto-increment (`++id`).

2. **`realmId` field:** When Dexie Cloud is enabled, all synced tables need a `realmId` field. This can be added as an optional field now so future migration is additive: `realmId?: string`. For a single-user app, this will default to the user's private realm automatically.

3. **Version.upgrade() restriction:** Dexie Cloud's docs warn: "Don't use Version.upgrade() except for non-synced tables." This means the existing migration in db.ts (versions 8/9) is fine for now, but once cloud sync is added, future migrations cannot use upgrade() on synced tables. Plan schema carefully to avoid needing table-structure migrations after cloud sync is enabled.

4. **Self-hosted option:** Dexie Cloud offers a Node.js + PostgreSQL self-hosted deployment. Single-user = free tier (3 production users). This is viable for the project.

**Recommendation:** Add `realmId?: string` to all entity interfaces in db.ts during the overhaul. This is a zero-cost preparatory change that makes future cloud sync a non-breaking migration.

---

## Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| @tanstack/react-query-devtools | Dev-time query cache inspection | Add to providers.tsx behind `process.env.NODE_ENV === 'development'` |
| TypeScript strict flags | noUncheckedIndexedAccess + exactOptionalPropertyTypes | Edit tsconfig.json; expect error surfacing to fix |
| vitest.config.mts | Vitest configuration file | Required separate from Next.js config; use `.mts` extension |

---

## Installation

```bash
# Testability layer
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths fake-indexeddb

# Dev tools
pnpm add -D @tanstack/react-query-devtools
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| vitest | jest | Jest requires babel transform for ESM, more config overhead; Vitest is official Next.js recommendation and has first-class Vite integration. Project already has Playwright; Vitest fills the unit test gap without introducing a second bundler. |
| vitest | jest with ts-jest | ts-jest adds type-checking overhead to test runs; Vitest handles TypeScript natively via esbuild transpilation. |
| fake-indexeddb | idb-keyval mocks / manual mocks | fake-indexeddb is the standard Dexie testing recommendation; provides a real IDB API surface so Dexie's internals work correctly without special-casing. |
| Dexie Cloud | RxDB with Dexie storage | RxDB provides Dexie.js as a storage adapter but adds a separate reactive layer on top; unnecessary complexity when Dexie itself is the primary DB layer. RxDB's Dexie adapter is maintained but secondary to RxDB's own storage. |
| Zod 3 (stay) | Upgrade to Zod 4 | v4 has meaningful API breaks; ecosystem compatibility still maturing; the overhaul milestone is about stability not dependency churn. Revisit after milestone is complete. |
| @testing-library/react | cypress component testing | Cypress component testing conflicts with Playwright E2E already in use; two browser test frameworks create config complexity. RTL + Vitest covers unit/integration; Playwright covers E2E. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| jest | ESM config friction with Next.js App Router; Vitest is the official Next.js recommendation as of 2025 and natively handles `@/*` path aliases | vitest |
| Dexie Syncable (community addon) | Abandoned/unmaintained; last updated 2019; not compatible with Dexie 4 | Dexie Cloud addon (official) |
| localforage | Adds indirection over IndexedDB; not compatible with Dexie transactions; no cloud sync path | Dexie.js (already in use) |
| idb (Jeff Posnick's wrapper) | Good library but redundant when Dexie is already the IDB layer; mixing two IDB wrappers creates transaction scope conflicts | Dexie.js (already in use) |
| Auto-increment primary keys (`++id`) | Not sync-safe for Dexie Cloud; collision risk across devices; current schema correctly uses UUID strings | crypto.randomUUID() (current pattern) |
| Zod v4 (immediately) | API surface changes break existing validation code; `z.string().email()` → `z.email()`, record schema, optional field behavior — require full audit | Stay on Zod 3 for this milestone |

---

## Stack Patterns by Variant

**For service function unit tests:**
- Use `fake-indexeddb/auto` import at test file top, or pass `{ indexedDB, IDBKeyRange }` from `fake-indexeddb` directly to Dexie constructor
- Reset DB between tests: create a fresh Dexie instance in each `beforeEach`
- Because Dexie uses real IndexedDB internally, schema migrations run in tests — use this to validate migration correctness

**For cross-domain queries:**
- Add compound indexes at the schema level (version 10)
- Use `.where("[prescriptionId+scheduledDate]").between(...)` for date-range queries within a prescription
- Cross-table joins must be done in application code (Dexie has no SQL JOIN): fetch from table A, map IDs, fetch from table B using `.anyOf(ids)`

**For Dexie Cloud migration (future milestone):**
- Add `import dexieCloud from 'dexie-cloud-addon'` to db.ts
- Add `realmId?: string` to all entity interfaces now
- Change `"id"` primary key in `.stores()` to remain `"id"` (UUID strings are already cloud-compatible)
- Add access control tables: `realms: '@realmId', members: '@id', roles: '[realmId+name]'`

**For TypeScript strict flags:**
- Enable `noUncheckedIndexedAccess` first — this generates most errors (array indexing patterns)
- Enable `exactOptionalPropertyTypes` second — catches interface mismatches with Dexie schema types
- Fix errors as you encounter them during overhaul; do not add `// @ts-ignore` suppressions

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| vitest ^4.0 | Next.js 14, React 18 | Requires separate `vitest.config.mts` — do NOT add test config to `next.config.js`. Works alongside Playwright. |
| fake-indexeddb ^6.2.5 | Dexie 4.x | Version 6 updated Web Platform Tests to 2025; Dexie 4 compatibility confirmed. Dexie 4 changed some internal APIs — use fake-indexeddb v6+ only. |
| @testing-library/react ^16 | React 18 | React 19 requires v16+; project is on React 18 so this is forward-compatible. |
| @tanstack/react-query-devtools ^5.91 | @tanstack/react-query ^5.90 | Must match major version of react-query; v5 devtools auto-exclude in production. |
| Zod 3.x | Existing validation code | Stay pinned to `"3"` major version; `zod@3.25+` bundles v4 as subpath but root import remains v3 API. |

---

## Sources

- Next.js official Vitest setup guide (lastUpdated: 2026-02-27): https://nextjs.org/docs/app/guides/testing/vitest
- fake-indexeddb v6.2.5 npm page: https://www.npmjs.com/package/fake-indexeddb (2025 Web Platform Tests update confirmed)
- Dexie.js Compound Index docs: https://dexie.org/docs/Compound-Index (HIGH confidence for syntax)
- Dexie Cloud best practices — realmId, primary keys, upgrade() restrictions (MEDIUM confidence — official doc but couldn't fetch full text): https://dexie.org/cloud/docs/best-practices
- Zod v4 migration guide: https://zod.dev/v4/changelog (HIGH confidence — official changelog)
- Zod v4 InfoQ announcement (August 2025): https://www.infoq.com/news/2025/08/zod-v4-available/
- Vitest 4.0 release: https://vitest.dev/blog/vitest-4 (October 2025, stable browser mode)
- @tanstack/react-query-devtools v5 docs: https://tanstack.com/query/v5/docs/react/devtools
- TypeScript noUncheckedIndexedAccess reference: https://www.typescriptlang.org/tsconfig/
- WebSearch: "Dexie cloud UUID primary key global uniqueness" — multiple Dexie Cloud docs confirmed UUID requirement (MEDIUM confidence)

---

## Open Questions / LOW Confidence Items

1. **"NanoDB" identity**: The PROJECT.md mentions "future NanoDB cloud sync" but no established library named NanoDB for browser/Dexie sync was found. This likely refers to Dexie Cloud. Clarify with project owner before the cloud sync milestone. If it is a different library, research will be needed at that milestone.

2. **Dexie 4.3.0 vs 4.0.8**: Project uses `dexie@^4.0.8`. Latest is `4.3.0`. The minor version gap is safe to upgrade within `^4` semver. Version 4.3.0 adds Y.js support and React Suspense experimental hooks — neither is relevant to this milestone, but upgrading is low-risk and recommended.

3. **Zod v4 ecosystem readiness**: The claim that "ecosystem is still catching up" is MEDIUM confidence based on community reports. Verify actual compatibility with any react-hook-form + zod integration before committing to staying on v3.

---
*Stack research for: Intake Tracker health PWA — medication management + engineering overhaul*
*Researched: 2026-03-02*
