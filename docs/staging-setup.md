# Staging Environment Setup Guide

One-time manual configuration steps to activate the staging environment at `staging.intake-tracker.ryanjnoble.dev`.

**Prerequisites:**
- Phase 28 code changes merged to your deployment branch (service worker disable, CI update, staging-db-reset workflow)
- Access to: Vercel Dashboard, DNS provider, Privy Dashboard, Neon Console, GitHub repo Settings

---

## 1. Create the staging git branch

```bash
git checkout main
git pull origin main
git checkout -b staging
git push -u origin staging
```

This creates a persistent `staging` branch from the current `main`. Feature branches merge here for pre-production testing.

---

## 2. Neon: Create staging database branch

1. Open the [Neon Console](https://console.neon.tech)
2. Select your project
3. Go to **Branches**
4. Click **Create Branch**
   - **Name:** `staging`
   - **Parent branch:** `main` (your production branch)
   - **Include data:** Yes (copies current production schema and data)
5. After creation, copy the **connection string** from the branch details page
   - Format: `postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`
   - Save this — you need it for the Vercel env var in step 5

**Verify:** The Branches page shows both `main` and `staging` branches.

---

## 3. DNS: Add staging subdomain CNAME

Add a CNAME record for the staging subdomain at your DNS provider:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | staging.intake-tracker | cname.vercel-dns.com | 300 |

The full domain will be `staging.intake-tracker.ryanjnoble.dev`.

**Verify:** After DNS propagation (up to 5 minutes), `dig staging.intake-tracker.ryanjnoble.dev CNAME` returns `cname.vercel-dns.com`.

---

## 4. Vercel: Assign staging domain to branch

1. Open your project in the [Vercel Dashboard](https://vercel.com)
2. Go to **Settings > Domains**
3. Add domain: `staging.intake-tracker.ryanjnoble.dev`
4. When prompted, assign it to the **Git Branch:** `staging`
5. Vercel will verify the DNS automatically

**Verify:** The Domains page shows `staging.intake-tracker.ryanjnoble.dev` assigned to the `staging` branch.

---

## 5. Vercel: Configure staging environment variables

Go to **Settings > Environment Variables** and add/override these for the **Preview** environment, filtered to the `staging` branch:

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | *(Neon staging connection string from step 2)* | Isolates push notification data from production |
| `ALLOWED_EMAILS` | *(Same value as production)* | **REQUIRED** — prevents unauthorized access |
| `NEXT_PUBLIC_PRIVY_APP_ID` | *(Same as production)* | Same Privy app, different allowed origins |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID` | *(Same as production)* | Same Privy app |

> **WARNING:** If `ALLOWED_EMAILS` is not set, the staging environment will allow ANY authenticated Privy user to access the app. Always set this to the same value as production.

For each variable:
1. Click **Add New**
2. Enter the key and value
3. Select **Preview** as the environment
4. Under **Git Branch**, type `staging` to scope it to the staging branch only

**Verify:** The Environment Variables page shows all four variables scoped to Preview + staging branch.

---

## 6. Privy: Add staging origin

1. Open the [Privy Dashboard](https://dashboard.privy.io)
2. Go to your app's **Settings**
3. Under **Allowed Origins** (or **Allowed Domains**), add:
   - `https://staging.intake-tracker.ryanjnoble.dev`
4. Save

**Verify:** The staging origin appears in the allowed list.

---

## 7. GitHub: Add Neon secrets

1. Go to your repo's **Settings > Secrets and variables > Actions**
2. Add two repository secrets:
   - `NEON_PROJECT_ID` — Your Neon project ID (found in Neon Console > Project Settings)
   - `NEON_API_KEY` — A Neon API key with branch management permissions (Neon Console > Account > API Keys)

**Verify:** Both secrets appear in the Actions secrets list.

---

## 8. Verify the staging deployment

1. Push a change to the `staging` branch:
   ```bash
   git checkout staging
   git merge main
   git push origin staging
   ```
2. Wait for Vercel to deploy (check Vercel Dashboard > Deployments)
3. Navigate to `https://staging.intake-tracker.ryanjnoble.dev`

**Verification checklist:**
- [ ] Page loads successfully at the staging URL
- [ ] About dialog shows "Preview" environment badge
- [ ] Privy login works (test with your email)
- [ ] Browser DevTools > Application > Service Workers shows no service workers
- [ ] Push notification setup writes to staging Neon branch (check Neon Console > staging branch > Tables)

---

## Troubleshooting

**Login fails on staging:**
- Check Privy Dashboard: is `https://staging.intake-tracker.ryanjnoble.dev` in Allowed Origins?
- Check Vercel env vars: are `NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_PRIVY_CLIENT_ID` set for Preview+staging?

**Service worker still active:**
- Clear browser cache and site data for the staging domain
- Check DevTools > Application > Service Workers and click "Unregister" if any are listed
- Verify `next.config.js` has the `VERCEL_ENV !== 'preview'` check

**Database errors on staging:**
- Verify `DATABASE_URL` env var points to the Neon staging branch connection string
- Check Neon Console: does the staging branch exist and is it active?

**Staging DB reset not working:**
- Check GitHub Actions: does the `staging-db-reset.yml` workflow show a run?
- Verify `NEON_PROJECT_ID` and `NEON_API_KEY` secrets are set in GitHub repo settings
- Run the workflow manually via Actions > Reset Staging DB > Run workflow
