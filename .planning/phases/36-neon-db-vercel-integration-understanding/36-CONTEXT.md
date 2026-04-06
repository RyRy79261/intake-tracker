# Phase 36: Neon DB + Vercel Integration Understanding - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Research and document the Neon DB + Vercel integration: how branch databases map to Vercel environments, how env vars are injected, and the full lifecycle of preview/staging/production database branches. Produce an architecture document with a migration path toward full NeonDB usage as the primary data store.

</domain>

<decisions>
## Implementation Decisions

### Research Scope
- **D-01:** Focus on Neon branch DB lifecycle — how branches map to Vercel environments (production/preview/staging), when branches are created/destroyed, and how preview deploys get isolated DBs
- **D-02:** Cover both preview deploy branch automation AND staging/main branch structure
- **D-03:** The current design intent is: Neon auto-creates branch DBs for Vercel preview deploys, and the staging Neon branch resets from parent (production) when staging is updated
- **D-04:** Verify the integration is actually working as intended via live dashboard inspection (Neon + Vercel dashboards using browser automation)

### Output Format
- **D-05:** Produce an architecture document at `docs/architecture/neon-vercel.md` — permanent reference doc checked into the repo
- **D-06:** Document should include a diagram showing branch relationships, env var injection flow, and lifecycle events
- **D-07:** Include a verification checklist — concrete steps to confirm the integration is correctly configured

### Future Architecture Direction
- **D-08:** Default storage model shifts from "offline-first, IndexedDB is everything" to "cloud-first with offline resilience" — NeonDB becomes the primary data store
- **D-09:** Replace Privy auth with Neon Auth — solves E2E testing limitations and removes a service dependency
- **D-10:** IndexedDB becomes an offline cache/buffer, not the source of truth — data saves locally when no internet connection, syncs to NeonDB when reconnected
- **D-11:** Settings should include a local-only/cloud toggle so the app can work without cloud sync if desired
- **D-12:** Direct Neon sync (IndexedDB <-> API routes <-> NeonDB) preferred over Dexie Cloud — avoids adding another service
- **D-13:** Architecture doc must include a migration path section covering how both PWA and future Android app would share the same NeonDB backend via API routes
- **D-14:** Architecture doc should compare conflict resolution strategies for offline-to-cloud sync and recommend an approach

### Current Pain Points
- **D-15:** ~15 Neon/Postgres env vars in .env.template with unclear purposes — document which are auto-injected by the Vercel integration vs manually set, and which are actually used by the codebase
- **D-16:** No current way to verify the integration is set up properly — architecture doc must address this with a verification section

### Claude's Discretion
- Diagram format and tooling (Mermaid, ASCII, etc.)
- Level of detail in the conflict resolution strategy comparison
- How to structure the migration path section (phased approach vs big-bang)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Neon Integration
- `src/lib/push-db.ts` — Only file using `@neondatabase/serverless`; push notification subscriptions, dose schedules, sent logs
- `.env.template` — All Neon/Postgres/Vercel env vars with security policy comments
- `.github/workflows/staging-db-reset.yml` — Neon staging branch reset-from-parent workflow
- `.github/workflows/promote-to-production.yml` — Production snapshot creation before promotion

### Vercel Configuration
- `next.config.js` — References `VERCEL_ENV` for PWA gating and environment detection

### Project Context
- `.planning/PROJECT.md` §Constraints — "Offline-first" and "Sync-friendly schema" constraints that this phase's findings may revise
- `.planning/PROJECT.md` §Out of Scope — "Cloud sync (NeonDB/Dexie Cloud)" listed as future milestone

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/push-db.ts`: Existing pattern for `@neondatabase/serverless` usage — `neon()` driver with raw SQL, no ORM
- `src/__tests__/bundle-security.test.ts`: Tests that DATABASE_URL and NEON_DATABASE_URL are not leaked to client bundle

### Established Patterns
- Server-only DB access via Next.js API routes — client never sees connection strings
- Raw SQL via `@neondatabase/serverless` (no Prisma/Drizzle) — lightweight, serverless-friendly
- GitHub Actions for DB lifecycle management (reset, snapshot)

### Integration Points
- Vercel Marketplace Neon integration (installed) — auto-injects env vars
- `DATABASE_URL` env var consumed by `push-db.ts` — would be the same entry point for expanded DB usage
- 16 Dexie.js tables (IndexedDB) that would need server-side schemas if migrating to NeonDB

</code_context>

<specifics>
## Specific Ideas

- User thought data was already migrated to NeonDB — only push notifications use it. Architecture doc should make the current state very clear upfront.
- Privy removal is motivated by E2E testing limitations, not just simplification — Neon Auth is the intended replacement
- Android app is planned for the future — API-based sync must work for both PWA and native clients
- The app must continue working offline (health tracking during travel between SA and Germany where connectivity varies)

</specifics>

<deferred>
## Deferred Ideas

- Full cloud sync implementation (IndexedDB <-> NeonDB) — future milestone, this phase only documents the path
- Privy removal and Neon Auth migration — future milestone
- Android app development — future milestone
- Server-side schema creation for all 16 Dexie tables — future milestone
- Local-only/cloud toggle in Settings UI — future milestone

</deferred>

---

*Phase: 36-neon-db-vercel-integration-understanding*
*Context gathered: 2026-04-06*
