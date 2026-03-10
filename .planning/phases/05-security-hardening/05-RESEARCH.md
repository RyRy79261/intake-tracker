# Phase 5: Security Hardening - Research

**Researched:** 2026-03-10
**Domain:** Client/server security, API key management, encryption foundations, auth middleware, CSP headers
**Confidence:** HIGH

## Summary

Phase 5 hardens the application's security posture across four domains: (1) removing client-side API key storage and the associated UI, (2) building encryption foundation hooks using the existing `crypto.ts` primitives, (3) centralizing auth middleware for all API routes with NeonDB sync readiness, and (4) adding CSP/HTTP security headers plus dependency auditing.

The codebase already has strong foundations -- `crypto.ts` provides complete AES-GCM + PBKDF2 encryption, `privy-server.ts` handles JWT verification with whitelist checking, and `next.config.js` already has CSP and security headers configured. The main work is cleanup (removing client API key paths), centralization (auth middleware replacing duplicated code in 4 routes), and documentation (SECURITY.md, env var audit).

**Primary recommendation:** This phase is primarily a cleanup and hardening phase, not a greenfield build. Most infrastructure exists; the work is removing insecure patterns, centralizing duplicated auth logic, and building the `useEncryptedField` hook as a foundation for future use.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Remove `perplexityApiKey` from settings store entirely -- server-side key only
- Remove `aiAuthSecret` from settings store -- redundant with Privy token verification
- Remove AI integration settings section from `/settings` UI entirely -- AI just works when authenticated
- Remove XOR obfuscation code from `security.ts` (`obfuscateApiKey`, `deobfuscateApiKey`)
- Unauthenticated users trying AI features get blocked with inline sign-in prompt
- Add automated build-time test that greps compiled client bundle for API key patterns
- Audit all `NEXT_PUBLIC_` env vars, confirm none leak secrets, document env var security policy
- No full DB encryption -- prioritise reactivity over encrypting every IndexedDB read/write
- PIN gate + Privy auth is the primary access control mechanism
- Build reusable `useEncryptedField` hooks ready to drop in but not wired to any tables
- Write SECURITY.md documenting encryption model, PIN gate pattern, field-level encryption guidance
- Optional encrypted backup export -- user chooses encrypted or plain JSON
- Sync target is NeonDB (Postgres), NOT Dexie Cloud
- Build reusable API route auth middleware: verify Privy JWT + ALLOWED_EMAILS whitelist check
- Migrate all 4 existing AI API routes to use the new middleware
- Auth-only middleware (no rate limiting, no DB health check)
- Update PROJECT.md to change NanoDB/Dexie Cloud references to NeonDB (Postgres)
- Add production guard for `LOCAL_AGENT_MODE`
- Strengthen `sanitizeForAI()` with more PII patterns
- Ensure all AI API routes use centralized sanitization
- Moderate CSP -- block inline scripts (except Next.js required), allow known external domains
- Standard HTTP security headers via next.config.js
- Run `pnpm audit`, fix high/critical vulnerabilities
- Add CI step that fails on high/critical dependency vulnerabilities

### Claude's Discretion
- Specific PII patterns to add to sanitizeForAI()
- Auth middleware implementation details (higher-order function, wrapper, Next.js middleware)
- CSP directive specifics (which domains to allowlist for Privy SDK, service worker compat)
- Additional HTTP security headers beyond the ones listed
- Key derivation approach for useEncryptedField hooks
- How to handle settings store migration when removing perplexityApiKey/aiAuthSecret fields
- Build test implementation (Playwright, vitest, or shell script)

### Deferred Ideas (OUT OF SCOPE)
- Full IndexedDB encryption at rest
- Rate limiting on API routes
- Auto-lock timeout (inactivity-based re-lock)
- Field-level encryption of medication data (hooks built but not wired)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SECU-01 | API keys removed from client storage -- Perplexity key server-side only | Settings store migration, obfuscation code removal, AI settings UI deletion, client API key path removal from all hooks/components, build-time bundle scan |
| SECU-02 | Encryption foundations for data at rest (PIN + encryption patterns) | `useEncryptedField` hook design using existing `crypto.ts`, SECURITY.md documentation, encrypted backup export/import |
| SECU-03 | Auth patterns designed for future cloud sync (no retrofit needed) | Centralized auth middleware wrapping `verifyAndCheckWhitelist`, NeonDB sync-ready patterns, `LOCAL_AGENT_MODE` production guard |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Crypto API | Browser native | AES-GCM encryption, PBKDF2 key derivation | Already implemented in `crypto.ts`, no dependencies needed |
| Zustand persist | 4.x | Settings store with localStorage persistence | Already in use, has built-in `migrate` option for version upgrades |
| @privy-io/server-auth | current | Server-side JWT verification | Already in `privy-server.ts`, foundation for auth middleware |
| Zod | 3.x | Request validation in API routes | Already used in all 4 AI routes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next-pwa | current | Service worker + PWA config | Already configured, CSP must account for SW scope |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Higher-order function middleware | Next.js middleware.ts | Next.js middleware runs at edge, cannot use Node.js crypto or Privy server SDK; HOF is correct for API route auth |
| Vitest build scan | Shell script grep | Vitest integrates with existing test infra, but shell script is simpler for CI; recommend vitest for consistency |

## Architecture Patterns

### Recommended Project Structure (New/Modified Files)
```
src/
├── lib/
│   ├── auth-middleware.ts       # NEW: Centralized API route auth wrapper
│   ├── security.ts              # MODIFIED: Remove obfuscation, strengthen PII sanitization
│   ├── crypto.ts                # UNCHANGED: Already complete
│   ├── backup-service.ts        # MODIFIED: Add encrypted export option
│   └── privy-server.ts          # MODIFIED: Add LOCAL_AGENT_MODE production guard
├── hooks/
│   ├── use-encrypted-field.ts   # NEW: Reusable encryption hook (foundation only)
│   └── use-settings.ts          # MODIFIED: Remove usePerplexityKey, useAiAuthSecret
├── stores/
│   └── settings-store.ts        # MODIFIED: Remove API key fields, add persist migration
├── components/
│   └── settings/
│       └── ai-integration-section.tsx  # DELETE
├── app/
│   └── api/ai/
│       ├── parse/route.ts              # MODIFIED: Use auth middleware
│       ├── medicine-search/route.ts    # MODIFIED: Use auth middleware
│       ├── substance-enrich/route.ts   # MODIFIED: Use auth middleware
│       └── status/route.ts             # MODIFIED: Use auth middleware
SECURITY.md                             # NEW: Repo root security documentation
next.config.js                          # MODIFIED: Refine CSP headers
```

### Pattern 1: Auth Middleware as Higher-Order Function
**What:** Wrap API route handlers with auth verification, extracting duplicated auth logic
**When to use:** All API routes requiring authentication
**Why HOF over Next.js middleware.ts:** Next.js middleware runs at the Edge Runtime, which does not support the `@privy-io/server-auth` package (it requires Node.js runtime). API route-level wrapping is the correct pattern.

```typescript
// src/lib/auth-middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAndCheckWhitelist, type VerificationResult } from "./privy-server";

export interface AuthenticatedRequest {
  request: NextRequest;
  auth: VerificationResult;
}

type AuthenticatedHandler = (
  ctx: AuthenticatedRequest
) => Promise<NextResponse>;

export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authHeader = request.headers.get("authorization");
    const authToken = authHeader?.replace("Bearer ", "") || null;

    const auth = await verifyAndCheckWhitelist(authToken);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized", requiresAuth: true },
        { status: 401 }
      );
    }

    return handler({ request, auth });
  };
}
```

### Pattern 2: Zustand Persist Migration for Field Removal
**What:** Use Zustand's built-in `version` + `migrate` to cleanly remove `perplexityApiKey` and `aiAuthSecret`
**When to use:** When removing fields from a persisted store

```typescript
// In settings-store.ts persist config
{
  name: "intake-tracker-settings",
  storage: createJSONStorage(() => localStorage),
  version: 1, // Bump from default 0
  migrate: (persistedState: unknown, version: number) => {
    const state = persistedState as Record<string, unknown>;
    if (version === 0) {
      // Remove deprecated API key fields
      delete state.perplexityApiKey;
      delete state.aiAuthSecret;
    }
    return state as Settings & SettingsActions;
  },
}
```

### Pattern 3: useEncryptedField Hook (Foundation)
**What:** Hook that wraps `crypto.ts` encrypt/decrypt for individual field values, using PIN from pin-service
**When to use:** Future field-level encryption (not wired to tables in this phase)

```typescript
// src/hooks/use-encrypted-field.ts
import { encrypt, decrypt, type EncryptedData } from "@/lib/crypto";

export function useEncryptedField() {
  const encryptField = async (value: string, pin: string): Promise<EncryptedData> => {
    return encrypt(value, pin);
  };

  const decryptField = async (encrypted: EncryptedData, pin: string): Promise<string> => {
    return decrypt(encrypted, pin);
  };

  return { encryptField, decryptField };
}
```

### Pattern 4: Encrypted Backup Export
**What:** Extend `backup-service.ts` to optionally encrypt the entire backup JSON using `crypto.ts`
**When to use:** User chooses "encrypted" during export

The backup format should use a wrapper that auto-detects on import:
```typescript
interface EncryptedBackup {
  encrypted: true;
  payload: EncryptedData; // From crypto.ts
  version: number;
}
```
Import detects `encrypted: true` and prompts for PIN before parsing inner JSON.

### Anti-Patterns to Avoid
- **Client-side API key fallback:** The parse and medicine-search routes currently accept `clientApiKey` in the request body. This entire path must be removed -- no API keys from the client, period.
- **Duplicated sanitization:** Each route currently has its own inline `sanitizeInput` function that duplicates `sanitizeForAI()` from security.ts. Centralize to the one in security.ts.
- **Checking `isPrivyConfigured()` before auth:** Current routes have complex branching (Privy configured? -> verify -> fallback to client key). With auth middleware, the flow is: authenticate or reject. No fallback paths.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT verification | Custom JWT parsing | `@privy-io/server-auth` `verifyAuthToken` | Already implemented in `privy-server.ts`, handles token expiry, signature verification |
| Encryption primitives | Custom crypto | Web Crypto API via `crypto.ts` | Already implemented with AES-GCM, PBKDF2, proper IV/salt generation |
| Store migration | Manual localStorage cleanup | Zustand persist `migrate` option | Built-in, handles version tracking, runs automatically on hydration |
| CSP headers | String concatenation | `next.config.js` `headers()` | Already configured, just needs refinement |
| Bundle scanning | Custom AST parser | Simple regex grep on build output | API keys have known formats (`pplx-`), simple string search is sufficient |

## Common Pitfalls

### Pitfall 1: Zustand Persist Migration Not Running
**What goes wrong:** Migration function exists but old localStorage data persists
**Why it happens:** Zustand persist defaults to version 0. If you don't set `version: 1`, the migration never triggers because the stored version matches.
**How to avoid:** Explicitly set `version: 1` in the persist config. The current store has no version set (defaults to 0), so bumping to 1 triggers migration.
**Warning signs:** After deploy, `perplexityApiKey` still appears in localStorage `intake-tracker-settings`.

### Pitfall 2: Removing Settings UI But Not the Store Fields
**What goes wrong:** UI is gone but store still has the fields, they persist in localStorage forever
**Why it happens:** Deleting the component but forgetting the store migration
**How to avoid:** Migration must explicitly `delete` the fields from persisted state. Both the interface AND the persisted data need cleanup.

### Pitfall 3: CSP Breaking Privy Login Modal
**What goes wrong:** Privy's login modal fails to load or authenticate
**Why it happens:** Privy uses iframes (`frame-src`), external scripts, and WebSocket connections (WalletConnect). Overly strict CSP blocks these.
**How to avoid:** The current CSP already allows `frame-src 'self' https://auth.privy.io` and `connect-src` includes Privy/WalletConnect domains. Verify these are preserved. Test login flow after any CSP changes.
**Warning signs:** Privy login modal shows blank white, or console shows CSP violation errors.

### Pitfall 4: Service Worker + CSP Conflicts
**What goes wrong:** PWA service worker registration fails or cached assets don't load
**Why it happens:** Service workers need `worker-src 'self'` and sometimes `script-src` permissions
**How to avoid:** The current CSP uses `script-src 'self' 'unsafe-eval' 'unsafe-inline'` which covers SW. If tightening CSP (removing unsafe-inline), ensure SW registration still works. Next-pwa generates inline scripts for registration.
**Warning signs:** SW fails to register in production, app loses offline capability.

### Pitfall 5: Backup Service Still References perplexityApiKey
**What goes wrong:** The `exportBackup()` function destructures `perplexityApiKey` from settings to exclude it. After removal, this code errors or becomes dead code.
**Why it happens:** Backup service has its own reference to the field name for exclusion.
**How to avoid:** Update `backup-service.ts` line 63 -- remove the `perplexityApiKey` destructure since it no longer exists. Also update `retention.ts` line 97 which deletes `perplexityApiKey` during retention cleanup.

### Pitfall 6: CLIENT_AGENT_MODE Check is Compile-Time in Client Components
**What goes wrong:** `process.env.NEXT_PUBLIC_LOCAL_AGENT_MODE` is inlined at build time by Next.js. A runtime production guard in the client component has no effect.
**Why it happens:** `NEXT_PUBLIC_*` vars are replaced by their literal values during the Next.js build. The server-side guard in `privy-server.ts` is the one that matters at runtime.
**How to avoid:** The production guard for `LOCAL_AGENT_MODE` should be in `privy-server.ts` (server-side, where it's checked at runtime). The client-side `auth-guard.tsx` check is build-time only, which is actually safe (if not set during prod build, it's `undefined`). Document this distinction.

## Code Examples

### Files That Reference Client API Keys (Must Be Modified)

Complete list of files with client API key references that need modification:

1. **`src/stores/settings-store.ts`** -- Remove `perplexityApiKey`, `aiAuthSecret` fields, setters, getters; remove `obfuscateApiKey`/`deobfuscateApiKey` imports; add persist migration
2. **`src/hooks/use-settings.ts`** -- Remove `usePerplexityKey()`, `useAiAuthSecret()` hooks entirely
3. **`src/lib/security.ts`** -- Remove `obfuscateApiKey()`, `deobfuscateApiKey()`, `OBFUSCATION_KEY` constant
4. **`src/lib/perplexity.ts`** -- Remove `clientApiKey` option from `parseIntakeWithPerplexity()`
5. **`src/components/voice-input.tsx`** -- Remove client API key fallback logic (lines ~89-92)
6. **`src/hooks/use-medicine-search.ts`** -- Remove `clientApiKey` from fetch body (lines ~53, 60-61)
7. **`src/components/settings/ai-integration-section.tsx`** -- Delete entire file
8. **`src/lib/backup-service.ts`** -- Remove `perplexityApiKey` exclusion from export (line 63)
9. **`src/lib/retention.ts`** -- Remove `perplexityApiKey` deletion (line 97)
10. **`src/app/api/ai/parse/route.ts`** -- Remove `clientApiKey` from schema and processing
11. **`src/app/api/ai/medicine-search/route.ts`** -- Remove `clientApiKey` from schema and processing

### API Routes That Need Auth Middleware Migration

All 4 routes currently duplicate auth checking inline:

1. **`src/app/api/ai/parse/route.ts`** -- Has rate limiting + auth + client key fallback. Replace with `withAuth()` wrapper, keep rate limiting separately, remove client key path.
2. **`src/app/api/ai/medicine-search/route.ts`** -- Same pattern as parse. Replace with `withAuth()`.
3. **`src/app/api/ai/substance-enrich/route.ts`** -- Same pattern. Replace with `withAuth()`.
4. **`src/app/api/ai/status/route.ts`** -- GET endpoint, no auth currently. May want auth or may leave public (it exposes no secrets, just config booleans).

### PII Patterns to Add to sanitizeForAI()

Current patterns: email, US phone, SSN. Recommended additions:

```typescript
export function sanitizeForAI(input: string): string {
  return input
    // Existing
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[email]")
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, "[ssn]")
    // International phone (+ prefix)
    .replace(/\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{3,10}\b/g, "[phone]")
    // Date of birth patterns (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY)
    .replace(/\b(19|20)\d{2}[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/g, "[date]")
    .replace(/\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](19|20)\d{2}\b/g, "[date]")
    // Credit card numbers (basic pattern)
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "[card]")
    // South African ID numbers (13 digits)
    .replace(/\b\d{13}\b/g, "[id-number]")
    .trim()
    .slice(0, 500);
}
```

### NEXT_PUBLIC_ Env Var Audit Results

Current `NEXT_PUBLIC_` variables (from `.env.template` and `.env.local`):
| Variable | Contains Secret? | Verdict |
|----------|-----------------|---------|
| `NEXT_PUBLIC_PRIVY_APP_ID` | No -- public app identifier | Safe |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID` | No -- public client identifier | Safe |
| `NEXT_PUBLIC_APP_VERSION` | No -- set from package.json | Safe |
| `NEXT_PUBLIC_GIT_SHA` | No -- git commit hash | Safe |
| `NEXT_PUBLIC_VERCEL_ENV` | No -- deployment environment name | Safe |
| `NEXT_PUBLIC_LOCAL_AGENT_MODE` | No -- boolean flag | Safe (but needs prod guard) |

No `NEXT_PUBLIC_` variables contain secrets. `PERPLEXITY_API_KEY`, `PRIVY_APP_SECRET`, `ALLOWED_EMAILS`, and all `DATABASE_URL`/`POSTGRES_*` vars are server-only (no prefix). This is correct.

### Existing CSP Headers (Already in next.config.js)

The project already has comprehensive security headers:
- **CSP:** `default-src 'self'`, `script-src 'self' 'unsafe-eval' 'unsafe-inline'`, proper connect-src for Privy/Perplexity, frame-src for Privy
- **X-Frame-Options:** DENY
- **X-Content-Type-Options:** nosniff
- **Referrer-Policy:** strict-origin-when-cross-origin
- **Permissions-Policy:** camera=(), microphone=(self), geolocation=()

Missing header that should be added:
- **Strict-Transport-Security:** `max-age=63072000; includeSubDomains; preload` (HSTS -- only meaningful when served over HTTPS, which Vercel handles)

The CSP is already well-configured. Minor refinement: consider if `'unsafe-eval'` can be removed in production (Next.js dev requires it, production may not depending on configuration). Test carefully.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side API key storage | Server-only API keys with auth tokens | Standard practice | Prevents key theft via XSS or localStorage inspection |
| XOR obfuscation of secrets | No client secrets at all | Always the right answer | Obfuscation provides no real security, just obscurity |
| Per-route auth checking | Centralized auth middleware | Common pattern | Reduces duplication, ensures consistent enforcement |
| Dexie Cloud sync target | NeonDB (Postgres) sync target | User decision | Changes auth pattern needs -- JWT verified server-side against Postgres, not Dexie Cloud tokens |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (configured) + Playwright E2E |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm vitest run --reporter=verbose` |
| Full suite command | `pnpm test:e2e` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SECU-01a | No API keys in client bundle | build + grep | `pnpm build && ! grep -r "pplx-" .next/static/` | No -- Wave 0 |
| SECU-01b | Settings store no longer has API key fields | unit | `pnpm vitest run src/__tests__/security.test.ts` | No -- Wave 0 |
| SECU-01c | API routes reject requests without auth | unit | `pnpm vitest run src/__tests__/auth-middleware.test.ts` | No -- Wave 0 |
| SECU-02a | useEncryptedField encrypts/decrypts correctly | unit | `pnpm vitest run src/__tests__/encrypted-field.test.ts` | No -- Wave 0 |
| SECU-02b | Encrypted backup roundtrip works | unit | `pnpm vitest run src/__tests__/backup-encryption.test.ts` | No -- Wave 0 |
| SECU-03a | Auth middleware verifies Privy JWT | unit | `pnpm vitest run src/__tests__/auth-middleware.test.ts` | No -- Wave 0 |
| SECU-03b | LOCAL_AGENT_MODE ignored in production | unit | `pnpm vitest run src/__tests__/auth-middleware.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter=verbose`
- **Per wave merge:** `pnpm build && pnpm vitest run`
- **Phase gate:** Full build succeeds + no API key strings in bundle + all vitest pass

### Wave 0 Gaps
- [ ] `src/__tests__/security.test.ts` -- covers SECU-01 (settings migration, no client keys)
- [ ] `src/__tests__/auth-middleware.test.ts` -- covers SECU-01c, SECU-03a, SECU-03b
- [ ] `src/__tests__/encrypted-field.test.ts` -- covers SECU-02a
- [ ] `src/__tests__/backup-encryption.test.ts` -- covers SECU-02b
- [ ] Build scan script/test for SECU-01a (bundle grep)

## Open Questions

1. **Should `status` route require auth?**
   - What we know: It exposes only boolean config flags (privyConfigured, serverApiKeyConfigured) and env name. No secrets.
   - What's unclear: Whether exposing config status to unauthenticated users is acceptable.
   - Recommendation: Leave it unauthenticated for debugging, but consider removing `serverApiKeyLength` from the response as it leaks information about key size.

2. **Can `'unsafe-eval'` be removed from production CSP?**
   - What we know: Next.js development requires `'unsafe-eval'`. Production may not, depending on version and features used.
   - What's unclear: Whether the current Next.js 14 app uses any runtime eval in production.
   - Recommendation: Test production build with `'unsafe-eval'` removed. If it works, remove it. If not, keep it and document why.

3. **Settings component that imports ai-integration-section**
   - What we know: The file must be deleted, and whatever parent component renders it needs updating.
   - What's unclear: The exact parent component (likely the settings page).
   - Recommendation: Grep for `AiIntegrationSection` or `ai-integration-section` imports to find the parent.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all affected files (settings-store.ts, security.ts, crypto.ts, privy-server.ts, auth-guard.tsx, all 4 API routes, backup-service.ts, retention.ts)
- `.env.template` and `.env.local` for env var audit

### Secondary (MEDIUM confidence)
- [Zustand persist migration docs](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data) -- version + migrate pattern
- [Next.js CSP guide](https://nextjs.org/docs/pages/guides/content-security-policy) -- CSP configuration in next.config.js
- [Next.js headers config](https://nextjs.org/docs/pages/api-reference/config/next-config-js/headers) -- async headers() function

### Tertiary (LOW confidence)
- `'unsafe-eval'` production removal -- needs testing to confirm (search results suggest it may be needed for some Next.js features)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- patterns are straightforward (HOF middleware, Zustand migration, crypto hook wrapper)
- Pitfalls: HIGH -- identified from direct code analysis, all references traced
- CSP refinement: MEDIUM -- existing config is good, minor additions only

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable domain, no fast-moving dependencies)
