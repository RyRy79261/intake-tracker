# Phase 30: Observability & Rollback - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the running app version visible to the user and document how to recover from bad deployments. This phase adds no new runtime features — it validates existing version display and creates operational documentation.

</domain>

<decisions>
## Implementation Decisions

### Version Display
- **D-01:** The existing `AboutDialog` component satisfies OBS-01 — it already shows version (from `NEXT_PUBLIC_APP_VERSION`), environment badge, and git SHA. No UI changes needed to the display itself.
- **D-02:** No inline version text on the Settings page — the dialog behind the "About App" button is sufficient for a single-user app.
- **D-03:** No additional version display features (changelog links, staging banners, etc.) — current dialog covers what's needed.

### Rollback Runbook
- **D-04:** Quick-reference format in `docs/ROLLBACK.md` — concise numbered steps, not a detailed multi-scenario guide. Matches the solo-project scale.
- **D-05:** Runbook covers both app deployment rollback (Vercel Instant Rollback + git revert) AND database recovery (Neon snapshot restore from pre-promotion snapshots created by Phase 29's promotion workflow).
- **D-06:** README links to the rollback runbook for discoverability.

### Claude's Discretion
- Exact runbook structure and step ordering
- Whether to include a "quick decision tree" (is it a UI bug? DB issue? env var problem?) at the top
- Level of Neon API detail in the DB recovery section
- Whether to add a verification checklist after each recovery procedure

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Version display infrastructure
- `src/components/about-dialog.tsx` — Existing version dialog showing version, environment, build SHA
- `src/hooks/use-version-check.ts` — Client-side version check hook (polls `/api/version` every 5 min)
- `src/app/api/version/route.ts` — Server endpoint returning version, gitSha, environment
- `next.config.js` line 59 — `NEXT_PUBLIC_APP_VERSION` injection from `package.json`

### Settings page
- `src/app/settings/page.tsx` — Settings page where AboutDialog is rendered (line 80)

### Deployment infrastructure (from prior phases)
- `.planning/phases/27-release-automation/27-CONTEXT.md` — Release Please manages package.json version
- `.planning/phases/28-staging-environment/28-CONTEXT.md` — Staging environment, Neon branch management
- `.planning/phases/29-deployment-protection/29-CONTEXT.md` — Promotion workflow, pre-promotion Neon snapshots

### Requirements
- `.planning/REQUIREMENTS.md` — OBS-01 and OBS-02 define acceptance criteria for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AboutDialog` — Already fully implements version display (version, env badge, git SHA). No modifications needed for OBS-01.
- `useVersionCheck` hook — Polls `/api/version` every 5 minutes, detects stale clients, offers reload. Already production-ready.
- `/api/version` route — Returns `{ version, gitSha, environment }`. Build-time values from `next.config.js`.

### Established Patterns
- `NEXT_PUBLIC_APP_VERSION` is set from `package.json` at build time in `next.config.js` — Release Please (Phase 27) keeps this accurate
- `NEXT_PUBLIC_GIT_SHA` and `NEXT_PUBLIC_VERCEL_ENV` are Vercel-provided build-time variables
- Environment detection uses `VERCEL_ENV` (`production` / `preview` / `development`)

### Integration Points
- The `AboutDialog` is already integrated at the bottom of the Settings page (line 80)
- Phase 29's promotion workflow creates Neon snapshots before production deploys — the runbook documents how to use those snapshots for recovery

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The phase is primarily about validating existing infrastructure (version display) and creating operational documentation (rollback runbook).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 30-observability-rollback*
*Context gathered: 2026-04-05*
