# Phase 28: Staging Environment - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish a stable staging environment at `staging.intake-tracker.ryanjnoble.dev` with its own isolated Neon DB branch, disabled service worker, and correctly configured auth. Manual Vercel + DNS setup is documented but performed by the user.

</domain>

<decisions>
## Implementation Decisions

### Service Worker Disabling
- **D-01:** Disable `next-pwa` on staging via `VERCEL_ENV` check in `next.config.js` — only load next-pwa when `VERCEL_ENV === 'production'`. Staging gets `VERCEL_ENV='preview'` automatically from Vercel. Zero-config per deploy.

### Staging Branch Workflow
- **D-02:** Feature branches merge to `staging` for testing, then `staging` merges to `main` for production — standard gitflow-lite
- **D-03:** Direct push to `staging` branch is allowed (single-user app, no PR overhead for pre-release testing). Branch protection rules come in Phase 29.

### Neon Branch Management
- **D-04:** Neon staging branch reset triggered by GitHub Action when Release Please creates a GitHub Release — fully automated, tied to release lifecycle
- **D-05:** Reset mechanism is delete + recreate from the production (main) Neon branch — clean slate every time, no schema drift
- **D-06:** Safety guard: staging branch name is hardcoded in the GitHub Action with an explicit check — if branch name matches production, abort with error. Prevents accidental production DB destruction.

### Claude's Discretion
- Exact Vercel project/domain configuration documentation structure
- Neon API call implementation details in the GitHub Action
- Staging-specific environment variable list (DATABASE_URL, Privy origins, etc.)
- Whether to add a staging health check endpoint

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Service Worker / PWA
- `next.config.js` — Current next-pwa conditional loading (line 3-10), VERCEL_ENV exposure (line 60)
- `src/hooks/use-service-worker.ts` — Client-side SW registration hook, needs to respect staging disable

### Neon Database
- `src/lib/push-db.ts` — All Neon DB usage; uses `DATABASE_URL` env var for push notification tables

### Auth
- `src/app/providers.tsx` — Privy provider setup, reads `NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_PRIVY_CLIENT_ID`

### Prior Phase
- `.planning/phases/27-release-automation/27-CONTEXT.md` — Release Please setup that staging inherits

### Requirements
- `.planning/REQUIREMENTS.md` — STG-01 through STG-06 define acceptance criteria for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `NEXT_PUBLIC_VERCEL_ENV` already exposed in `next.config.js` — can distinguish staging from production without new env vars
- `next-pwa` conditional loading pattern already exists (`NODE_ENV === 'production'` check) — just needs to add `VERCEL_ENV` gate
- `use-service-worker.ts` has `unregisterServiceWorker()` function — fallback cleanup if SW somehow registers on staging

### Established Patterns
- Environment variables follow `NEXT_PUBLIC_*` convention for client-side values
- Server-side env vars (DATABASE_URL, ALLOWED_EMAILS) are read directly from `process.env`
- Neon connection via `@neondatabase/serverless` with parameterized queries

### Integration Points
- Vercel git integration auto-deploys branches — staging branch maps to staging domain
- GitHub Actions can call Neon API for branch management (delete/create)
- Release Please GitHub Release event triggers the Neon reset workflow
- Phase 29 adds branch protection on top of the staging branch created here

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

- **Production database backup before promotions** — User wants assurance that staging→main promotions don't destroy production data. Belongs in Phase 29 (Deployment Protection) or Phase 30 (Rollback). Consider Neon point-in-time restore or pre-promotion branch snapshot.
- **Automated promotion testing** — User wants a way to verify upgrades from staging to main don't break anything. Belongs in Phase 29 (CI gates on promotion workflow).

</deferred>

---

*Phase: 28-staging-environment*
*Context gathered: 2026-04-04*
