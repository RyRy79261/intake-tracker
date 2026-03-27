# Phase 5: Security Hardening - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

No secrets exposed to the client, data-at-rest encryption foundations in place, auth patterns designed for future NeonDB sync. Strong access control prioritised over full DB encryption — reactivity must not be degraded.

</domain>

<decisions>
## Implementation Decisions

### Client API Key Removal (SECU-01)
- Remove `perplexityApiKey` from settings store entirely — server-side key only
- Remove `aiAuthSecret` from settings store — redundant with Privy token verification
- Remove AI integration settings section from `/settings` UI entirely — AI just works when authenticated
- Remove XOR obfuscation code from `security.ts` (`obfuscateApiKey`, `deobfuscateApiKey`)
- Unauthenticated users trying AI features (food parse, medicine search) get blocked with inline sign-in prompt
- Add automated build-time test that greps compiled client bundle for API key patterns — fails CI if found
- Audit all `NEXT_PUBLIC_` env vars, confirm none leak secrets, document the env var security policy

### Encryption Foundations (SECU-02)
- **No full DB encryption** — prioritise reactivity over encrypting every IndexedDB read/write
- PIN gate + Privy auth is the primary access control mechanism (current model is sufficient)
- Build reusable `useEncryptedField` hooks that are ready to drop in but not wired to any tables yet — pattern is coded, not applied
- Write SECURITY.md at repo root documenting: encryption model (AES-GCM + PBKDF2 in crypto.ts), PIN gate pattern, where/when to apply field-level encryption
- Optional encrypted backup export — user chooses encrypted (PIN-protected) or plain JSON when exporting. Restore detects format automatically

### Auth Middleware & Sync Readiness (SECU-03)
- **Sync target is NeonDB (Postgres), NOT Dexie Cloud** — no Dexie Cloud account needed
- Build reusable API route auth middleware: verify Privy JWT + ALLOWED_EMAILS whitelist check
- Migrate all 4 existing AI API routes (parse, medicine-search, substance-enrich, status) to use the new middleware
- Auth-only middleware (no rate limiting, no DB health check) — keep it focused
- Update PROJECT.md to change all "NanoDB/Dexie Cloud" references to "NeonDB (Postgres)"
- Add production guard for `LOCAL_AGENT_MODE` — if set when `NODE_ENV=production`, log warning and ignore it

### PII Stripping
- Strengthen `sanitizeForAI()` in security.ts — add more patterns beyond current email/phone/SSN (names, addresses, dates of birth)
- Ensure all AI API routes consistently use sanitization before sending to Perplexity

### CSP & HTTP Security Headers
- Moderate Content Security Policy — block inline scripts (except Next.js required), allow self + known external domains (Privy, Perplexity)
- Add standard HTTP security headers via next.config.js: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`

### Dependency Audit
- Run `pnpm audit`, fix high/critical vulnerabilities
- Add CI step that fails on high/critical dependency vulnerabilities — ongoing protection

### Claude's Discretion
- Specific PII patterns to add to sanitizeForAI()
- Auth middleware implementation details (higher-order function, wrapper, Next.js middleware)
- CSP directive specifics (which domains to allowlist for Privy SDK, service worker compat)
- Additional HTTP security headers beyond the ones listed
- Key derivation approach for useEncryptedField hooks
- How to handle the settings store migration when removing perplexityApiKey/aiAuthSecret fields
- Build test implementation (Playwright, vitest, or shell script)

</decisions>

<specifics>
## Specific Ideas

- "I would like a solution that could scale if I felt like it" — auth patterns should support multi-user even though it's single-user today
- "Prioritising reactivity over encryption" — access control is the security model, not encryption at rest
- Sync target is definitively NeonDB (Postgres), not Dexie Cloud — user wants no Dexie account

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/crypto.ts`: Full AES-GCM + PBKDF2 implementation — encrypt, decrypt, hashPin, verifyPin, generateSecureId. Ready for useEncryptedField hooks
- `src/lib/pin-service.ts`: Gate secret pattern with sessionStorage — complete PIN lifecycle (setup, unlock, change, remove, lock)
- `src/lib/security.ts`: sanitizeForAI(), sanitizeTextInput(), sanitizeNumericInput(), isSecureContext(), getSecurityWarnings() — needs PII pattern expansion
- `src/hooks/use-pin-gate.tsx`: Full PIN gate React context + hooks — no changes needed
- `src/components/auth-guard.tsx`: Privy auth guard with LOCAL_AGENT_MODE bypass — needs production guard
- `src/lib/privy-server.ts`: Server-side Privy utilities — foundation for JWT verification in middleware

### Established Patterns
- API routes in `src/app/api/ai/` all follow same pattern: read `process.env.PERPLEXITY_API_KEY`, call Perplexity, return result
- Each route has its own auth/key checking logic — needs centralization via middleware
- Settings store uses Zustand persist with localStorage — removing fields requires migration handling
- `backup-service.ts` exports/imports all tables as JSON — needs encrypted variant

### Integration Points
- `src/stores/settings-store.ts`: Remove perplexityApiKey, aiAuthSecret fields + obfuscation imports
- `src/components/settings/ai-integration-section.tsx`: Remove entirely
- `src/app/api/ai/*`: All 4 routes migrate to auth middleware
- `next.config.js` or `next.config.ts`: CSP and security headers
- `.env.template`: Audit and document all env vars
- `src/components/auth-guard.tsx`: Add NODE_ENV production guard for LOCAL_AGENT_MODE
- PROJECT.md: Update sync target references from NanoDB/Dexie Cloud to NeonDB

</code_context>

<deferred>
## Deferred Ideas

- Full IndexedDB encryption at rest — deferred until performance impact can be measured and reactivity tradeoff is acceptable
- Rate limiting on API routes — not needed for single-user, revisit if multi-user
- Auto-lock timeout (inactivity-based re-lock) — current 24h session model is sufficient
- Field-level encryption of medication data — hooks will be built but not wired

</deferred>

---

*Phase: 05-security-hardening*
*Context gathered: 2026-03-10*
