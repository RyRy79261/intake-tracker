# Security Model

Security documentation for the Intake Tracker health PWA. This is a reference document describing implemented patterns, not aspirational goals.

## Overview

Single-user health tracking PWA. All user data lives client-side in IndexedDB. The security model prioritizes access control over encryption at rest, since IndexedDB does not support transparent encryption and the app relies on `useLiveQuery` reactivity which requires plaintext-queryable data.

## Access Control Model

### Neon Auth

- **Provider:** Neon Auth (email/password) backed by Neon Postgres
- **Whitelist enforcement:** `ALLOWED_EMAILS` env var checked server-side in `src/lib/auth-middleware.ts`
- **Session verification:** HttpOnly session cookie validated on every API request via `withAuth()` in `src/lib/auth-middleware.ts`
- **Client guard:** `src/components/auth-guard.tsx` wraps protected routes

### E2E Test Authentication

E2E tests use a seeded Neon Auth user (email + password) for automated authentication. Playwright's `globalSetup` (`e2e/global-setup.ts`) authenticates against Neon Auth, captures the session cookie, and persists `playwright/.auth/user.json` for all test projects to reuse.

## API Security

### Server-Side Keys

All API keys are server-side only. No secrets are exposed via `NEXT_PUBLIC_` environment variables.

- `ANTHROPIC_API_KEY` -- used in API routes only (`src/app/api/ai/_shared/claude-client.ts` shared by all AI routes)
- `NEON_AUTH_COOKIE_SECRET` -- used by Neon Auth to sign session cookies
- `NEON_AUTH_URL` -- Neon Auth service endpoint (proxied via `/api/auth/[...path]`)
- `DATABASE_URL` -- Neon Postgres connection string (Neon Auth user store + push notification tables)

### Auth Middleware

API routes use auth middleware from `src/lib/auth-middleware.ts` to validate the Neon Auth session cookie and check the email whitelist before processing requests.

### PII Sanitization

`sanitizeForAI()` in `src/lib/security.ts` strips emails, phone numbers, and SSN patterns from text before sending to the AI API. Input is also length-limited to 500 characters.

## Encryption Model

### Primitives (src/lib/crypto.ts)

- **Algorithm:** AES-GCM (authenticated encryption)
- **Key derivation:** PBKDF2 with SHA-256, 100,000 iterations
- **Key length:** 256 bits
- **IV:** 96-bit random per encryption
- **Salt:** 128-bit random per encryption

The user's PIN is the passphrase for key derivation. Encryption strength depends on PIN complexity.

### useEncryptedField Hook

`src/hooks/use-encrypted-field.ts` provides a React hook wrapping `encrypt`/`decrypt` for field-level encryption. This hook is built but not wired to any Dexie tables -- it is available for future use when specific fields require encryption at rest.

### Encrypted Backups

`src/lib/backup-service.ts` supports optional encrypted export/import:

- `exportEncryptedBackup(pin)` -- encrypts the full backup JSON with the user's PIN
- `importEncryptedBackup(file, pin)` -- decrypts and imports an encrypted backup
- `importBackup(file)` -- auto-detects encrypted format and returns an informative error directing to `importEncryptedBackup()`

The encrypted backup format wraps the payload in an `EncryptedBackup` envelope: `{ encrypted: true, payload: EncryptedData, version: number }`.

## Data at Rest

- **IndexedDB is NOT encrypted.** All record data is stored in plaintext in the browser's IndexedDB. This is a deliberate tradeoff: `useLiveQuery` requires direct IndexedDB queries, which are incompatible with transparent encryption.
- **Access control is the primary protection.** Neon Auth prevents unauthorized access to the app.
- **Field-level encryption is available but not wired.** The `useEncryptedField` hook and `crypto.ts` primitives exist for future use on specific sensitive fields, but no fields are currently encrypted.

## Content Security Policy

Defined in `next.config.js` and applied to all routes via response headers:

| Directive | Value | Reason |
|-----------|-------|--------|
| `default-src` | `'self'` | Restrict all resources to same origin |
| `script-src` | `'self' 'unsafe-eval' 'unsafe-inline'` | Required for Next.js |
| `style-src` | `'self' 'unsafe-inline'` | Required for Tailwind CSS |
| `img-src` | `'self' data: blob:` | App-generated images |
| `font-src` | `'self' data:` | Outfit font via next/font |
| `connect-src` | `'self' https://api.anthropic.com https://*.neon.tech` | Anthropic Claude API + Neon Auth |
| `frame-src` | `'self'` | No third-party iframes |
| `frame-ancestors` | `'none'` | Prevent embedding (clickjacking) |

Additional headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(self), geolocation=()`.

## Sync Readiness (NeonDB/Postgres)

The auth patterns are designed for future server-side sync:

- **Cookie session verification:** Already implemented server-side via Neon Auth, ready for API-based sync endpoints
- **No Dexie Cloud dependency:** The app uses plain Dexie.js, not Dexie Cloud, so sync can be implemented via any backend
- **Schema has realmId fields:** Database records include `realmId` for future multi-tenant partitioning when server-side sync is added
- **Device tracking:** Records include `deviceId` for conflict resolution across devices

## Environment Variables

| Variable | Secret | Location | Purpose |
|----------|--------|----------|---------|
| `NEON_AUTH_COOKIE_SECRET` | **Secret** | Server only | Neon Auth session cookie signing (≥32 chars) |
| `NEON_AUTH_URL` | Safe | Server only | Neon Auth service endpoint (proxied via `/api/auth/[...path]`) |
| `DATABASE_URL` | **Secret** | Server only | Neon Postgres connection (Neon Auth + push tables) |
| `ANTHROPIC_API_KEY` | **Secret** | Server only | AI parse/search/enrich API |
| `ALLOWED_EMAILS` | Safe | Server only | Email whitelist for auth |
| `NEXT_PUBLIC_APP_VERSION` | Safe | Client | Display version (from package.json) |
| `NEXT_PUBLIC_GIT_SHA` | Safe | Client | Display git SHA |
| `NEXT_PUBLIC_VERCEL_ENV` | Safe | Client + Server | Environment detection |
| `VERCEL_GIT_COMMIT_SHA` | Safe | Server (Vercel) | Git SHA source |
| `VERCEL_ENV` | Safe | Server (Vercel) | Environment detection (production/preview/development) |
