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
- **Voice logging**: Hold to talk, say everything at once, then review and approve each item before it is saved
- **Medical journal**: A written logbook of anything you notice — a symptom, something visible, or something that happened — in your own words, with an optional body place and 0–10 intensity. Prints as a dated table (PDF) to hand a doctor. Its text is encrypted at rest on the server ([details](#medical-journal))
- **Claude custom connector (MCP)**: Attach your data to a Claude chat as an MCP server — ask Claude "what was my average BP last week?" or "list my active medications" ([setup](#claude-custom-connector-mcp))
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

- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI Components**: shadcn/ui + Radix UI
- **Styling**: Tailwind CSS
- **Database**: IndexedDB via Dexie.js
- **State**: Zustand
- **Auth**: Neon Auth (cookie session, email/password)
- **PWA**: Serwist (@serwist/turbopack)
- **Encryption**: AES-256-GCM (Node `crypto`) on the server for stored AI API keys and journal text; see [Encryption](#encryption)

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

## Testing & Quality

The test suite is layered. See [`docs/TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md)
for the philosophy and per-paradigm rationale, and
[`docs/AUDIT_2026-05.md`](docs/AUDIT_2026-05.md) for the latest gap
analysis and prioritized recommendations.

| Layer | Command | Where |
|---|---|---|
| Unit / service (vitest) | `pnpm test` | `src/**/*.test.{ts,tsx}` |
| Unit, timezone-pinned | `pnpm test:tz` | Africa/Johannesburg + Europe/Berlin |
| Coverage | `pnpm test:coverage` | Thresholds in `vitest.config.mts` |
| Integration (testcontainers + Postgres) | `pnpm test:integration` | `src/__tests__/integration/` |
| E2E (Playwright) | `pnpm test:e2e` | `e2e/` |
| Mutation (Stryker, nightly) | `pnpm test:mutation` | `stryker.conf.json` |
| Benchmarks | `pnpm bench` | `src/__tests__/bench/` |

CI guarantees per PR ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

- Dual-timezone test runs (SA + DE) to catch DST and offset bugs.
- Schema migrations applied to an **ephemeral Neon branch per PR run**
  before E2E executes, so schema-vs-Postgres drift fails fast.
- Aggregate coverage threshold ratchet (currently lines 54 / statements 53
  / functions 45 / branches 44) — never lowered, only raised.
- Nightly mutation testing on the sync engine + MCP OAuth modules
  with a per-file score ratchet
  ([`.github/workflows/mutation.yml`](.github/workflows/mutation.yml)).
- Supply-chain audit (`pnpm audit --audit-level high`) with hardened
  install policy (`minimumReleaseAge: 1440`, `trustPolicy: no-downgrade`,
  `blockExoticSubdeps`).
- Bundle-security scan on the built production output (no API-key
  patterns, no dev-only surfaces).
- Meta-tests that lock the CI workflow shape, the Playwright config,
  and the supply-chain settings against silent drift.

## Installing on Your Phone

### Android

Install as a PWA:

1. Open the app in Chrome
2. Tap the menu (three dots)
3. Select "Add to Home Screen"

Or install the native build from the Google Play Store (Capacitor wrapper). The
signed release pipeline is documented in
[`docs/android-release.md`](docs/android-release.md) — publishing a GitHub
release builds a signed AAB and uploads it to Play automatically.

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
│  │  Neon Auth   │ │  IndexedDB  │  │   Sync engine       │ │
│  │ (cookie sess)│ │  (Dexie.js) │  │  (push / pull)      │ │
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

Every record lives in IndexedDB on the device and, when cloud sync is on, is
mirrored to Neon Postgres by the sync engine (`/api/sync/push` and
`/api/sync/pull`).

| Data Type | Storage | Protection |
|-----------|---------|------------|
| Health records (intake, BP, weight, food, medications, doses…) | IndexedDB; Neon when synced | Plain text on the device; in Neon, Neon's own disk encryption only |
| Journal entries | IndexedDB; Neon when synced | Plain text on the device; in Neon, the words and title are AES-256-GCM ciphertext |
| Settings | localStorage, and a synced settings row | Device-level |
| Auth session | Neon Auth cookie (HttpOnly) | Server-validated session |
| Your own AI API keys | Neon | AES-256-GCM, bound to your user id |
| Server AI keys | Server env | Never reaches browser |

### Encryption

What the app encrypts, and what it does not:

- **In transit**: HTTPS (HSTS, preload) for every request.
- **Journal text in Neon**: the push route encrypts a journal entry's words and
  title with AES-256-GCM before writing them, and the pull route decrypts them
  for your devices (`apps/web/src/lib/server/field-vault.ts`). The key is
  derived with HKDF from `API_KEY_ENCRYPTION_SECRET`; each value is bound to
  its user, row and field. A leak of the database alone reveals no journal
  text. The server holds the key, so this is encryption at rest, not
  end-to-end encryption.
- **Your AI API keys in Neon**: AES-256-GCM (`apps/web/src/lib/key-vault.ts`).
- **Not encrypted by the app**: IndexedDB on the device, the other synced
  tables in Neon (they rely on Neon's disk encryption), backups and exports
  (plain JSON, CSV, PDF).

Do not rotate `API_KEY_ENCRYPTION_SECRET` without re-encrypting: stored keys
and journal text would no longer decrypt (a new device would receive
"Unreadable entry" in their place).

### Medical journal

The Journal window (top bar, between Medications and Metrics) is a logbook,
not a tracker: each entry is a dated note with no "ongoing" state. An entry
keeps exactly what you said or typed, a short title, a kind (Felt, Seen or
Happened), and, only when they apply, body places and a 0–10 intensity
(LOINC 72514-3). The shape follows the SOCRATES symptom history and maps onto
the HL7 FHIR Symptoms guide, so a future export can code it.

- Typed entries: the title, kind, place and rating are suggested on the
  device as you type (`suggestJournalDetails` in `@intake/core/journal`);
  nothing typed is sent anywhere to do it.
- Spoken entries: the `journal_entry` voice item. The transcript goes to the
  voice parser like any other voice log; the review screen lets you fix or
  add every field before saving.
- Safety notices: a short fixed list of rules (a sudden or worst-ever
  headache, chest pain, stroke signs, bleeding from the gut or bladder → call
  112; bruising on blood thinners, leg swelling, or more than 2 kg gained in
  3 days → tell your doctor or heart team). They never block saving and never
  diagnose.
- Printout: the last 7–90 days, optionally only some titles, built as a PDF
  on the device.
- Deleting an entry wipes its words, title, places and rating on the device
  and on the server; only an empty tombstone remains for sync. There is no
  undo, but a backup exported before the deletion still holds the entry, and
  importing it restores the entry on the device and in the cloud copy.
- The Claude connector (MCP) can read journal entries and add new ones once
  you approve journal access (a connection made before this asks you to
  reconnect); it decrypts them on the server, as a sync pull does. It can
  delete only entries it added itself.

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

When you use an AI feature (you must be signed in and on the whitelist):
- **Food and drink parsing**: the description you typed goes to Anthropic Claude.
- **Voice logging**: the recording goes to Groq (Whisper) for transcription, and
  the transcript goes to Anthropic Claude to pick out the items. That includes
  anything you say for your journal.
- **AI Insights**: summary figures go to Anthropic; your conditions and
  medications only when you have opted in. Journal entries are not included.
- PII patterns are stripped from free text before it is sent.
- Each provider's own privacy terms apply to their processing.

### GDPR Compliance Features

- **Data Export**: Download all your data as JSON
- **Data Deletion**: Settings › Storage › Delete data marks records deleted on
  the device and in the cloud copy; a deleted journal entry's content is wiped.
  Delete account (in the Profile window) removes the cloud copy entirely.
- **Audit Trail**: changes to medications, doses, imports and exports are logged on the device

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

The app ships a [Model Context Protocol](https://modelcontextprotocol.io) server so you can attach **your own data** to a Claude chat as a custom connector and ask Claude to query it directly — "what was my average BP last week?", "how much water have I logged today?", "list my active medications". It reads your data; with the `intake-tracker:write` scope granted it can also log meals and drinks, and delete only the entries it logged. It cannot edit records or delete entries you logged in the app.

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
   ```text
   https://<your-app>/api/mcp/mcp
   ```
3. Click **Connect**. Claude redirects you to the intake-tracker.
4. Sign in with Google (skipped if you're already signed in to the app in that browser).
5. The consent screen lists the data Claude will be able to read. Click **Approve**.
6. You're back in Claude, the connector is now active. The tools below appear in any new chat.

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
| `query_substance_history` | caffeine and alcohol history |
| `query_urination_history` | urination history |
| `query_defecation_history` | bowel movement history |
| `list_titration_plans` | titration plans with their notes and warnings |
| `query_journal` | medical journal entries in a date range |
| `get_profile` | medical conditions, daily limits, day start, home time zone |
| `list_insight_reports` | AI analyses saved in the Metrics window |
| `log_food` *(write)* | log a meal with its water, sodium, sugar and potassium |
| `log_drink` *(write)* | log a drink with its caffeine, alcohol and solutes |
| `log_sodium` *(write)* | log salt, MSG or sodium added on its own |
| `log_weight` *(write)* | log a weight reading |
| `log_blood_pressure` *(write)* | log a blood pressure reading |
| `log_urination` / `log_defecation` *(write)* | log a urination or bowel movement |
| `add_journal_entry` *(write)* | add a journal entry (returns the app's safety notices) |
| `log_dose` *(write)* | mark a scheduled dose taken or skipped, or undo that |
| `log_extra_medicine` *(write)* | log an as-needed or unlisted medicine |
| `refill_stock` *(write)* | add pills to a medicine's stock |
| `delete_logged_entry` *(write)* | remove a meal or drink Claude logged |
| `delete_logged_record` *(write)* | remove a reading, journal entry, extra dose or refill Claude logged |

The connector does what the voice log does. It never adds or changes
prescriptions, schedules, titration plans or settings, and it removes only what
it logged itself. Conditions reach Claude only while "Share conditions with
AI" is on.

### Revocation

Disconnect at any time from **Settings → Connectors** in Claude. The server-side access token is invalidated on next request. Removing your email from `ALLOWED_EMAILS` also revokes access on the next call (the whitelist is re-checked per request).

### Design + security details

See [docs/mcp-connector.md](docs/mcp-connector.md) for the OAuth 2.1 + DCR flow, schema, threat model, and audit-log shape.

## Documentation

- [Testing & Quality Strategy](docs/TESTING_STRATEGY.md) — Test paradigms, implementation log, mutation baselines
- [Test, Coverage & CI Audit — May 2026](docs/AUDIT_2026-05.md) — Current state of testing + prioritized recommendations
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
