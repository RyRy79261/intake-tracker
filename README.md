# Intake Tracker

A Progressive Web App (PWA) for tracking daily water and salt intake with a rolling 24-hour window.

## Features

- **Rolling 24-hour tracking**: Intake is calculated based on the last 24 hours, not calendar days
- **Water intake tracking**: Monitor your daily fluid intake (target: 1L/day for heart health)
- **Salt intake tracking**: Keep sodium under control (target: <1500mg/day)
- **Food water calculator**: Calculate water content from fruits and vegetables
- **AI-powered input**: Use natural language to log intake via Anthropic Claude API
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

## Documentation

- [Rollback & Recovery Runbook](docs/ROLLBACK.md) — How to recover from bad production deployments
- [Staging Setup Guide](docs/staging-setup.md) — Manual Vercel and DNS configuration for staging

## License

This work is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

You are free to share and adapt this work for non-commercial purposes with attribution.
For commercial use, please contact the author for permission.
