# Phase 30: Observability & Rollback — Research

**Researched:** 2026-04-05
**Confidence:** HIGH
**Phase Goal:** The running app version is visible to the user and there is a documented procedure for recovering from bad deployments

## Summary

Phase 30 is primarily a **validation + documentation** phase. The version display infrastructure (OBS-01) is already fully built. The rollback runbook (OBS-02) needs to be created as `docs/ROLLBACK.md`. Risk is minimal — no runtime code changes are needed.

## Existing Infrastructure Assessment

### Version Display (OBS-01) — Already Complete

The version display chain is fully wired end-to-end:

1. **Source of truth:** `package.json` version field (currently `1.2.0`, managed by Release Please from Phase 27)
2. **Build injection:** `next.config.js` line 59 sets `NEXT_PUBLIC_APP_VERSION: packageJson.version`
3. **Server endpoint:** `src/app/api/version/route.ts` returns `{ version, gitSha, environment }`
4. **Client hook:** `src/hooks/use-version-check.ts` polls `/api/version` every 5 minutes, detects stale clients
5. **UI display:** `src/components/about-dialog.tsx` shows version, environment badge (Production/Preview/Development), and 7-char git SHA
6. **Integration point:** `AboutDialog` rendered in `src/app/settings/page.tsx` line 80 as a ghost button

**Assessment:** All components exist and are connected. No code changes needed. The phase only needs to **validate** that this chain works correctly (version in dialog matches `package.json`).

### Rollback Infrastructure (OBS-02) — Documentation Needed

The deployment infrastructure from Phases 27-29 provides all the rollback mechanisms:

1. **Vercel Instant Rollback:** Available from the Vercel dashboard → Deployments → select previous deployment → "Promote to Production". This is built into Vercel — no custom implementation.
2. **Git revert:** Standard `git revert` on `main` branch, then Vercel auto-deploys.
3. **Neon DB snapshot restore:** Phase 29's `promote-to-production.yml` creates `pre-promote-{sha7}-{date}` snapshots before each production promotion. These can be restored from the Neon dashboard or API.
4. **Staging DB reset:** `.github/workflows/staging-db-reset.yml` resets staging Neon branch on release.

**Assessment:** All recovery mechanisms are available. The phase needs to create `docs/ROLLBACK.md` documenting how to use them, and add a link from README.

## Deployment Topology

```
Feature Branch → PR → staging (auto-deploy) → Vercel Preview
    ↓
staging → PR → main (gated by CI + approval) → Vercel Production
    ↓ (on PR open)
promote-to-production.yml creates Neon snapshot
    ↓ (on merge)
Vercel deploys to production
Release Please creates release + tag
staging-db-reset.yml resets Neon staging branch
```

## Rollback Scenarios

The runbook should cover these failure scenarios:

### Scenario 1: UI/Frontend Bug
- **Symptom:** Broken UI, JS errors, visual regression
- **Recovery:** Vercel Instant Rollback (fastest — 1 click) OR `git revert` + force-push pipeline
- **DB impact:** None (client-side IndexedDB is independent)

### Scenario 2: API Route Bug
- **Symptom:** AI parsing failures, version check failures, push notification errors
- **Recovery:** Vercel Instant Rollback OR `git revert`
- **DB impact:** Check if bad API calls corrupted Neon push subscription data → may need Neon snapshot restore

### Scenario 3: Database Schema/Data Issue
- **Symptom:** Push notifications broken, auth/whitelist issues
- **Recovery:** Restore Neon snapshot created by `promote-to-production.yml`
- **DB impact:** Restore from `pre-promote-{sha7}-{date}` snapshot
- **Note:** Client-side IndexedDB data is unaffected — only server-side Neon data (push subscriptions) would need restoration

### Scenario 4: Environment Variable Misconfiguration
- **Symptom:** Auth failures, missing API keys, wrong database URL
- **Recovery:** Fix env vars in Vercel dashboard → redeploy (or rollback if faster)
- **DB impact:** Depends on which env var

## Runbook Structure Recommendation

```
docs/ROLLBACK.md
├── Quick Decision Tree (symptom → recovery path)
├── 1. Vercel Instant Rollback (step-by-step)
├── 2. Git Revert (step-by-step)  
├── 3. Neon Database Restore (step-by-step)
├── 4. Environment Variable Fix
└── Post-Recovery Verification Checklist
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `docs/ROLLBACK.md` | Create | Rollback runbook with numbered steps |
| `README.md` | Modify | Add link to rollback runbook |

## Files to Validate (No Modification)

| File | Validation |
|------|-----------|
| `src/components/about-dialog.tsx` | Shows `NEXT_PUBLIC_APP_VERSION` |
| `src/app/settings/page.tsx` | Contains `<AboutDialog />` |
| `next.config.js` | Injects `NEXT_PUBLIC_APP_VERSION` from `package.json` |
| `src/hooks/use-version-check.ts` | Polls `/api/version` correctly |
| `src/app/api/version/route.ts` | Returns version, gitSha, environment |

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Version display already broken | Low | Validate with build test |
| Neon snapshot API changes | Low | Document dashboard fallback |
| Runbook becomes stale | Low | Solo project — changes are infrequent |

## Validation Architecture

### Dimension 1: Functional Correctness
- Version in AboutDialog matches `package.json` version
- README contains link to `docs/ROLLBACK.md`

### Dimension 2: Integration
- Version display chain: `package.json` → `next.config.js` → `NEXT_PUBLIC_APP_VERSION` → `about-dialog.tsx`
- Runbook references correct workflow files and Neon snapshot naming convention

### Dimension 3: Edge Cases
- `NEXT_PUBLIC_APP_VERSION` unset → falls back to `0.0.0` (already handled)
- `NEXT_PUBLIC_GIT_SHA` unset → falls back to `local` (already handled)

### Dimension 4: Performance
- N/A — no runtime changes

### Dimension 5: Security
- N/A — no auth or data handling changes

### Dimension 6: Observability
- The phase itself IS the observability improvement

### Dimension 7: Rollback Safety
- The phase documents rollback procedures — meta-level safety

### Dimension 8: Validation Strategy
- Build verification: `pnpm build` succeeds
- File existence: `docs/ROLLBACK.md` exists
- Content verification: Grep for key sections in runbook
- README link: Grep for rollback reference in README

---

## RESEARCH COMPLETE

*Phase: 30-observability-rollback*
*Researched: 2026-04-05*
