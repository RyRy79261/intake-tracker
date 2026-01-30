# Intake Tracker

A Progressive Web App (PWA) for tracking daily water and salt intake with a rolling 24-hour window.

## Features

- **Rolling 24-hour tracking**: Intake is calculated based on the last 24 hours, not calendar days
- **Water intake tracking**: Monitor your daily fluid intake (target: 1L/day for heart health)
- **Salt intake tracking**: Keep sodium under control (target: <1500mg/day)
- **Food water calculator**: Calculate water content from fruits and vegetables
- **AI-powered input**: Use natural language to log intake via Perplexity API
- **Privy authentication**: Whitelist-based access control
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
- **Auth**: Privy (email, social, wallet)
- **PWA**: next-pwa
- **Encryption**: Web Crypto API (AES-GCM)

## Configuration

### Environment Variables

```bash
# .env.local

# Privy Authentication (from dashboard.privy.io)
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your-privy-app-secret

# Perplexity AI (for natural language parsing)
PERPLEXITY_API_KEY=pplx-your-api-key-here

# Whitelist - comma-separated emails allowed to use the app
ALLOWED_EMAILS=you@example.com,friend@example.com

# Or whitelist by wallet address
# ALLOWED_WALLETS=0x123...,0x456...
```

### Privy Setup

1. Create an account at [dashboard.privy.io](https://dashboard.privy.io)
2. Create a new app
3. Copy your App ID and App Secret
4. Add them to `.env.local`
5. Add your email to `ALLOWED_EMAILS`

### How Authentication Works

```
┌─────────────────────────────────────────────────────────────┐
│                        YOUR APP                              │
├─────────────────────────────────────────────────────────────┤
│  1. User clicks "Sign In"                                    │
│  2. Privy modal opens (email/Google/wallet)                  │
│  3. User authenticates → Privy returns token                 │
│  4. App sends token to API                                   │
│  5. Server verifies token + checks whitelist                 │
│  6. If on whitelist → AI features enabled                    │
│  7. If not → "Not authorized" error                          │
└─────────────────────────────────────────────────────────────┘
```

**This means:**
- Only whitelisted accounts can use your AI features
- Your Perplexity API key never leaves the server
- Random visitors can't use your API even if they find your URL
- You control exactly who has access via the whitelist

### Settings

Access settings via the gear icon to configure:

- Water/salt increment amounts for +/- buttons
- Daily limits for water (default 1000ml) and salt (default 1500mg)
- Fallback Perplexity API key (if not using Privy auth)

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
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ PrivyProvider│ │  IndexedDB  │  │   Web Crypto API    │ │
│  │ (Auth state) │ │  (Dexie.js) │  │  (AES-GCM ready)    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│         │                │                    │             │
│         └────────────────┴────────────────────┘             │
│                          │                                   │
│              ┌───────────┴───────────┐                      │
│              │  getAccessToken()     │                      │
│              │  (Privy JWT token)    │                      │
│              └───────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTPS + Bearer Token
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     SERVER (Next.js API)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │  /api/ai/parse  │  │  Privy Server Auth              │  │
│  │  - Verify token │  │  - Validate JWT signature       │  │
│  │  - Check whitelist│ │  - Get user email/wallet       │  │
│  │  - Rate limited │  │  - Check against ALLOWED_EMAILS │  │
│  │  - PII stripped │  └─────────────────────────────────┘  │
│  └─────────────────┘                                        │
│                          │                                   │
│              ┌───────────┴───────────┐                      │
│              │  PERPLEXITY_API_KEY   │                      │
│              │  (never sent to client)│                      │
│              └───────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTPS
                           ▼
                  ┌─────────────────┐
                  │  Perplexity AI  │
                  │  (External API) │
                  └─────────────────┘
```

### Data Storage

| Data Type | Storage | Protection |
|-----------|---------|------------|
| Intake records | IndexedDB | Device-level |
| Settings | localStorage | Device-level |
| Auth session | Privy (managed) | Cryptographic tokens |
| API keys | Server env | Never reaches browser |

### Security Features

| Feature | Implementation |
|---------|----------------|
| **Privy Authentication** | Email, Google, or wallet login |
| **Whitelist Enforcement** | Server checks email/wallet against ALLOWED_EMAILS/WALLETS |
| **Server-side API proxy** | Perplexity key stored in env, never sent to client |
| **JWT Verification** | Privy tokens cryptographically verified server-side |
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
- Only food/drink descriptions are sent to Perplexity
- PII patterns are automatically stripped
- All requests logged with user ID for audit
- Perplexity's privacy policy applies to their processing

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

### Fallback: Using Your Own API Key

If you don't want to use Privy auth, you can still use the app with your own API key:

1. Leave Privy env vars empty
2. Enter your Perplexity API key in Settings > AI Integration
3. The key is stored locally in your browser (obfuscated)

This is less secure but works for personal use on a trusted device.

## License

MIT
