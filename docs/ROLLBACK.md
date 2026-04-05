# Rollback & Recovery Runbook

Quick-reference guide for recovering from bad production deployments.

## Quick Decision Tree

| Symptom | Recovery Path |
|---------|--------------|
| Broken UI / JS errors | [1. Vercel Instant Rollback](#1-vercel-instant-rollback) |
| API route errors | [1. Vercel Instant Rollback](#1-vercel-instant-rollback) |
| Need to undo a specific commit | [2. Git Revert](#2-git-revert) |
| Push notification data corrupted | [3. Neon Database Restore](#3-neon-database-restore) |
| Wrong environment variables | [4. Environment Variable Fix](#4-environment-variable-fix) |

> **Note:** Client-side data (IndexedDB) is unaffected by all recovery procedures. Only server-side Neon data (push notification subscriptions) may need restoration.

---

## 1. Vercel Instant Rollback

**When:** Any production issue — fastest recovery option.

1. Open [Vercel Dashboard](https://vercel.com) → select **intake-tracker** project
2. Go to **Deployments** tab
3. Find the last known-good deployment
4. Click the **three-dot menu (...)** → **Promote to Production**
5. Confirm the rollback

**Time to recover:** ~30 seconds

---

## 2. Git Revert

**When:** You need to permanently remove a bad commit from the codebase and redeploy through the normal pipeline.

> **Tip:** For fastest recovery from any production issue, use [Vercel Instant Rollback](#1-vercel-instant-rollback) first (30 seconds). Use git revert when you need the bad commit gone from the codebase permanently — this takes 2-3 minutes because CI must run on the revert PR.

1. Identify the bad commit SHA:
   ```bash
   git log --oneline main -10
   ```
2. Create a revert branch:
   ```bash
   git checkout main && git pull origin main
   git checkout -b revert/<sha7>
   ```
3. Revert the commit:
   ```bash
   git revert <bad-commit-sha>
   ```
4. Push the revert branch:
   ```bash
   git push -u origin revert/<sha7>
   ```
5. Open a PR from `revert/<sha7>` to `main`
6. Wait for CI to pass (required — a revert is still a code change)
7. Approve and merge the PR
8. Vercel auto-deploys on merge to `main`

**Time to recover:** ~2-3 minutes (CI + build + deploy)

---

## 3. Neon Database Restore

**When:** Push notification data is corrupted or lost after a bad deployment.

The `promote-to-production.yml` workflow creates a snapshot named `pre-promote-{sha7}-{date}` before each production promotion.

> **Note:** Snapshot SHAs come from the merge commit (`github.sha`), not the PR head SHA. When looking for a snapshot, use the merge commit SHA from the GitHub PR page (shown after merge), not the last commit SHA from `git log`.

### Via Neon Dashboard

1. Open [Neon Console](https://console.neon.tech)
2. Select the **intake-tracker** project
3. Go to **Branches** → select the **production** branch
4. Find the snapshot from before the bad deploy (named `pre-promote-{sha7}-{YYYYMMDD}`)
5. Click **Restore** to roll back the database to that point

### Via Neon API

> **Prerequisites:** The Neon API commands below require three environment variables: `NEON_PROJECT_ID`, `NEON_API_KEY`, and `NEON_PROD_BRANCH_ID`. See [Staging Setup Guide, Section 7](staging-setup.md#7-github-add-neon-secrets) for how to configure these as GitHub secrets.

```bash
# List available snapshots
curl -s "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches/$NEON_PROD_BRANCH_ID/snapshots" \
  -H "Authorization: Bearer $NEON_API_KEY" | jq '.snapshots[] | {name, created_at}'

# Restore a specific snapshot
curl -s -X POST \
  "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches/$NEON_PROD_BRANCH_ID/restore" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source_branch_id": "<snapshot-branch-id>"}'
```

**Time to recover:** ~1-2 minutes

---

## 4. Environment Variable Fix

**When:** Deployment is fine but env vars are wrong (auth failures, missing API keys).

1. Open [Vercel Dashboard](https://vercel.com) → **intake-tracker** → **Settings** → **Environment Variables**
2. Fix the incorrect variable
3. Either:
   - **Redeploy:** Deployments → latest → three-dot menu → **Redeploy**
   - **Or rollback** if faster: see [1. Vercel Instant Rollback](#1-vercel-instant-rollback)

---

## Post-Recovery Checklist

After any recovery action, verify:

- [ ] App loads at production URL without errors
- [ ] Settings → About App shows expected version
- [ ] Push notifications are functional (if DB was restored)
- [ ] AI features respond (API keys valid)
- [ ] Authentication works (Privy configured correctly)
