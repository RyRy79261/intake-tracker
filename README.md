# Intake Tracker

A Progressive Web App (PWA) for tracking daily water and salt intake with a rolling 24-hour window.

## About

This app was created by me in response to difficulties in tracking the things
needed to manage a new chronic condition. The hope is if anyone else needs
this app the way I do, that it is here now. I can't offer the AI features for
free but I can make it easier to set it up yourself and use it.

## Features

- **Rolling 24-hour tracking**: Intake is calculated based on the last 24 hours, not calendar days
- **Water intake tracking**: Monitor your daily fluid intake (target: 1L/day for heart health)
- **Salt intake tracking**: Keep sodium under control (target: <1500mg/day)
- **Food water calculator**: Calculate water content from fruits and vegetables
- **AI-powered input**: Use natural language to log intake via Anthropic Claude API
- **Claude custom connector (MCP)**: Attach your data to a Claude chat as a read-only MCP server — ask Claude "what was my average BP last week?" or "list my active medications" ([setup](#claude-custom-connector-mcp))
- **Neon Auth**: Email/password authentication with whitelist-based access control
- **Offline support**: Works without internet connection as a PWA
- **Data export/import**: Backup and restore your data

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm 9+

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
pnpm run build
pnpm start
```

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI Components**: shadcn/ui + Radix UI
- **Styling**: Tailwind CSS
- **Database**: IndexedDB via Dexie.js
- **State**: Zustand
- **Auth**: Neon Auth (cookie session, email/password)
- **PWA**: next-pwa
- **Encryption**: Web Crypto API (AES-GCM)

## Postgres Schema (Neon + Drizzle)

The Postgres schema is managed via Drizzle ORM. The source of truth is
[`src/db/schema.ts`](./src/db/schema.ts). Migration SQL files are committed
under [`/drizzle/`](./drizzle/) for reviewability.

### Commands

| Command | Purpose |
|---|---|
| `pnpm db:generate` | Diff `src/db/schema.ts` against the last snapshot and emit a new `/drizzle/NNNN_<name>.sql` + updated snapshot JSON |
| `pnpm db:migrate`  | Apply pending migrations to the DB at `$DATABASE_URL` (uses drizzle-kit's `__drizzle_migrations` tracker) |
| `pnpm db:reset`    | Drop every app table in the `public` schema — preserves the auth schema (neon_auth). Destructive. Refuses to run if `DATABASE_URL` looks like production. |

### First-time setup for a new Neon branch

1. Create the branch in the [Neon console](https://console.neon.tech) or via `neonctl`.
2. Export the branch connection string: `export DATABASE_URL="postgres://..."`.
3. `pnpm db:reset`    — wipes any pre-existing `public` tables.
4. `pnpm db:migrate`  — creates all 20 tables + FKs + CHECK constraints.
5. Verify: `psql "$DATABASE_URL" -c '\dt public.*'` should list 20 tables.

The Neon Auth schema (which owns `users_sync`) must already be provisioned
on the branch — this happens automatically once Neon Auth is enabled (Phase 41).

### Editing the schema

1. Edit `src/db/schema.ts`.
2. `pnpm db:generate` — emits a new file under `/drizzle/`.
3. Review the generated SQL diff in your PR.
4. Commit everything under `/drizzle/` (the SQL file, `meta/_journal.json`, and
   the updated snapshot JSON).
5. `pnpm db:migrate` — apply locally.

**Never run `pnpm db:reset` against production.** The script includes a
heuristic that refuses to run if `DATABASE_URL` contains the substring `prod`,
but you can override it with `ALLOW_PROD_RESET=1`. Don't.

## Configuration

### Environment Variables

```bash
# .env.local

# Neon Auth (Postgres) — auth + user store
DATABASE_URL=postgres://user:pass@host/dbname
NEON_AUTH_URL=https://your-branch.neon-auth.neon.tech
NEON_AUTH_COOKIE_SECRET=generate-with-openssl-rand-base64-32

# Anthropic Claude AI (for natural language parsing)
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Whitelist - comma-separated emails allowed to use the app
ALLOWED_EMAILS=you@example.com,friend@example.com

# Or whitelist by wallet address
# ALLOWED_WALLETS=0x123...,0x456...
```

### Neon Auth Setup

1. Provision a Postgres database on [Neon](https://neon.tech) and enable Neon Auth on the branch
2. Copy the connection string into `DATABASE_URL`
3. Copy the Neon Auth endpoint URL (Neon console → Branch → Auth) into `NEON_AUTH_URL`
4. Generate a cookie signing secret: `openssl rand -base64 32` → `NEON_AUTH_COOKIE_SECRET`
5. Add your email to `ALLOWED_EMAILS`

### How Authentication Works

```
┌─────────────────────────────────────────────────────────────┐
│                        YOUR APP                              │
├─────────────────────────────────────────────────────────────┤
│  1. User visits /auth and signs in (email + password)        │
│  2. Neon Auth issues an HttpOnly session cookie              │
│  3. Each API call sends the cookie automatically             │
│  4. withAuth() middleware reads the cookie + checks          │
│     whitelist                                                │
│  5. If on whitelist → AI features enabled                    │
│  6. If not → "Not authorized" error                          │
└─────────────────────────────────────────────────────────────┘
```

**This means:**
- Only whitelisted accounts can use your AI features
- Your Anthropic API key never leaves the server
- Random visitors can't use your API even if they find your URL
- You control exactly who has access via the whitelist

### Settings

Access settings via the gear icon to configure:

- Water/salt increment amounts for +/- buttons
- Daily limits for water (default 1000ml) and salt (default 1500mg)
- AI integration settings

## Installing on Your Phone

### Android

1. Open the app in Chrome
2. Tap the menu (three dots)
3. Select "Add to Home Screen"

### iOS

1. Open the app in Safari
2. Tap the Share button
3. Select "Add to Home Screen"

## Security & Privacy

### Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT (Browser)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌─────────────┐  ┌─────────────────────┐ │
│  │  Neon Auth   │ │  IndexedDB  │  │   Web Crypto API    │ │
│  │ (cookie sess)│ │  (Dexie.js) │  │  (AES-GCM ready)    │ │
│  └──────────────┘ └─────────────┘  └─────────────────────┘ │
│         │                │                    │             │
│         └────────────────┴────────────────────┘             │
│                          │                                   │
│              ┌───────────┴───────────┐                      │
│              │  HttpOnly cookie      │                      │
│              │  (Neon Auth session)  │                      │
│              └───────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTPS + cookie
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     SERVER (Next.js API)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │  /api/ai/parse  │  │  withAuth() (Neon Auth)         │  │
│  │  - Read cookie  │  │  - Validate session             │  │
│  │  - Check whitelist│ │  - Resolve user email          │  │
│  │  - Rate limited │  │  - Check against ALLOWED_EMAILS │  │
│  │  - PII stripped │  └─────────────────────────────────┘  │
│  └─────────────────┘                                        │
│                          │                                   │
│              ┌───────────┴───────────┐                      │
│              │  ANTHROPIC_API_KEY    │                      │
│              │  (never sent to client)│                      │
│              └───────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTPS
                           ▼
                  ┌─────────────────┐
                  │  Anthropic      │
                  │  Claude API     │
                  └─────────────────┘
```

### Data Storage

| Data Type | Storage | Protection |
|-----------|---------|------------|
| Intake records | IndexedDB | Device-level |
| Settings | localStorage | Device-level |
| Auth session | Neon Auth cookie (HttpOnly) | Server-validated session |
| API keys | Server env | Never reaches browser |

### Security Features

| Feature | Implementation |
|---------|----------------|
| **Neon Auth** | Email/password login backed by Neon Postgres |
| **Whitelist Enforcement** | Server checks email against ALLOWED_EMAILS |
| **Server-side API proxy** | Anthropic key stored in env, never sent to client |
| **Cookie session** | HttpOnly session cookie validated server-side per request |
| **Rate limiting** | 20 requests/minute per IP |
| **PII stripping** | Emails, phones, SSNs removed before AI processing |
| **CSP headers** | Strict Content Security Policy |
| **Audit logging** | All AI requests logged with user ID |

### Managing the Whitelist

**Add/remove users by editing environment variables:**

```bash
# Single user
ALLOWED_EMAILS=you@gmail.com

# Multiple users
ALLOWED_EMAILS=you@gmail.com,friend@gmail.com,family@gmail.com

# Wallet addresses (for web3 users)
ALLOWED_WALLETS=0x1234...,0x5678...
```

After changing, redeploy your app for changes to take effect.

### AI Feature Privacy

When using the "AI Input" feature:
- User must be authenticated AND on whitelist
- Only food/drink descriptions are sent to Anthropic Claude
- PII patterns are automatically stripped
- All requests logged with user ID for audit
- Anthropic's privacy policy applies to their processing

### GDPR Compliance Features

- **Data Export**: Download all your data as JSON
- **Data Deletion**: Clear all data with one click
- **Data Minimization**: Auto-purge old records
- **Audit Trail**: Track all data access

### Security Headers

| Header | Value |
|--------|-------|
| Content-Security-Policy | Strict CSP with allowed sources |
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=() |

### AI Features

AI features require an authenticated Neon Auth session and a server-side `ANTHROPIC_API_KEY`. The API key is stored in the server environment only and never exposed to the client.

## Claude Custom Connector (MCP)

The app ships a [Model Context Protocol](https://modelcontextprotocol.io) server so you can attach **your own data** to a Claude chat as a custom connector and ask Claude to query it directly — "what was my average BP last week?", "how much water have I logged today?", "list my active medications". **Read-only**: the connector cannot insert, update, or delete records.

### Prerequisites

- A Claude account on **Pro, Max, Team, or Enterprise** (claude.ai's Custom Connectors UI requires DCR-capable OAuth, which Free plans don't currently expose).
- The app deployed to an HTTPS URL Claude can reach (Vercel preview or production both work; localhost only if you tunnel through e.g. `ngrok` or Cloudflare Tunnel).
- Your email is on `ALLOWED_EMAILS` — Claude signs you in with the same Google account you use for the app, and the whitelist applies to MCP requests too.

### Server configuration

Optional. The OAuth metadata auto-derives the public origin from `VERCEL_URL` or `X-Forwarded-*` headers, so a standard Vercel deploy works out of the box. Set this only when running behind a proxy that doesn't forward those headers, or to pin the issuer to a specific domain:

```bash
# .env.local (or Vercel env var) — no trailing slash
MCP_PUBLIC_URL=https://your-app.example.com
```

### Connecting in claude.ai

1. In Claude, open **Settings → Connectors → Add custom connector**.
2. Paste the MCP endpoint URL:
   ```
   https://<your-app>/api/mcp/mcp
   ```
3. Click **Connect**. Claude redirects you to the intake-tracker.
4. Sign in with Google (skipped if you're already signed in to the app in that browser).
5. The consent screen lists the data Claude will be able to read. Click **Approve**.
6. You're back in Claude, the connector is now active. The 8 read-only tools (below) appear in any new chat.

### Available tools

| Tool | What it returns |
|------|-----------------|
| `get_today_summary` | water/salt/sugar totals for today, latest BP/weight, doses logged |
| `query_intake_history` | water/salt/sugar records in a date range |
| `query_weight_history` | weight readings in a date range |
| `query_blood_pressure_history` | BP readings in a date range |
| `query_eating_history` | food log entries with linked caffeine/alcohol |
| `list_medications` | active prescriptions + current phase + schedules |
| `list_recent_doses` | most recent dose log entries |
| `get_inventory_status` | per-prescription pill stock + refill thresholds |

### Revocation

Disconnect at any time from **Settings → Connectors** in Claude. The server-side access token is invalidated on next request. Removing your email from `ALLOWED_EMAILS` also revokes access on the next call (the whitelist is re-checked per request).

### Design + security details

See [docs/mcp-connector.md](docs/mcp-connector.md) for the OAuth 2.1 + DCR flow, schema, threat model, and audit-log shape.

## Documentation

- [Rollback & Recovery Runbook](docs/ROLLBACK.md) — How to recover from bad production deployments
- [Staging Setup Guide](docs/staging-setup.md) — Manual Vercel and DNS configuration for staging
- [Claude Custom Connector (MCP) Design](docs/mcp-connector.md) — OAuth 2.1 + DCR flow, schema, threat model

## License

This project is licensed under the [Functional Source License, Version 1.1, with Apache 2.0 Future License (FSL-1.1-ALv2)](https://fsl.software/). See [LICENSE](LICENSE) for the full text.

**In plain language:**

- You can use, copy, modify, fork, and redistribute the code for **any purpose** — personal use, self-hosting, internal use at your organization, education, research, or as part of professional services you provide — **except a Competing Use**. The LICENSE defines a Competing Use as making the Software available to others in a commercial product or service that (1) substitutes for the Software, (2) substitutes for any other product or service the licensor offers using the Software, or (3) offers the same or substantially similar functionality as the Software.
- Clause (3) stands on its own: a commercial product or service offering the same or substantially similar functionality is a Competing Use **even if the licensor does not currently offer a competing product or service**.
- **Every release auto-converts to Apache 2.0 on the second anniversary of its publication.** Each version carries its own clock, so older versions become fully open source on a rolling basis.

**Examples:**

- A patient self-hosting their own copy to track a chronic condition: allowed.
- A clinician deploying it internally for their patients: allowed.
- A developer forking it, wiring up their own AI provider, and sharing it with a community: allowed.
- A company launching "HealthTrackerCloud" as a paid SaaS offering the same or substantially similar functionality as the Software: **not allowed** without a commercial license, whether or not the licensor currently offers a competing service.

### Commercial licensing

If your intended use is a Competing Use, or you're unsure whether it qualifies, please get in touch before deploying: **meowzit.eth@gmail.com**.
