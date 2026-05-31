# Verification — 34-auth

**Verdict:** accurate · checked 96 claims, verified 94.

The document is a faithful, code-accurate description of the auth subsystem. Every "Files covered" source was read in full, and the repo was grepped for related consumers (`useAuth`, `useAuthGate`, `AuthGuard`, `usersSync`, `reset=success`). Only two low-severity nits were found; no medium/high inaccuracies. Several of the doc's own self-flagged caveats (e.g. `reset=success` never read) were independently confirmed true.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | Page-level doc comment cites "Next.js 14 requires that hook to be inside a Suspense boundary" / "Next 14 delivers a synchronous params bag…" as rationale. The 34-auth doc itself does not repeat the version number, so this is a code-comment staleness note rather than a doc error. The project runs Next.js 16 (per CLAUDE.md). | The doc text does not assert a Next version, so no doc inaccuracy; flagged only because the doc's "Suspense (needed for useSearchParams)" framing leans on a comment that names Next 14. Behavior described (Suspense wrapping) is correct. | `src/app/auth/page.tsx:13`, `src/app/auth/reset-password/page.tsx:17` |
| low | "Auth error: Server `error.message` (or 'Sign in failed')." and capacitor `router.replace(callbackURL)` "on success". | Accurate, but the success branch only replaces in capacitor mode AND only when there is no `result.error`; in web mode nothing is done in the handler (cookie + auto-forward effect). Doc states this correctly elsewhere (line 67/219); the States table phrasing is a slight compression but not wrong. | `src/app/auth/sign-in-form.tsx:69-73` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | Sign-up form, capacitor mode: on success it also saves the returned bearer token via `saveAuthToken(result.data.token)` before `router.replace("/")`. Doc covers sign-in/social token-save (line 46) and the proxy save, but does not call out that the **sign-up form component itself** also saves the token (in addition to no proxy on `signUp`). | `src/app/auth/sign-up-form.tsx:70-72` |
| low | `signUp` is NOT proxied for capacitor token-saving (unlike `signIn.email`/`signIn.social`, which are Proxy-wrapped in `auth-client.ts`); the sign-up form does the token save inline instead. Doc's "Capacitor … sign-in/up/social save a bearer token" (line 46) is true in effect but conflates two different mechanisms (proxy vs inline). | `src/lib/auth-client.ts:16-49`, `src/app/auth/sign-up-form.tsx:70` |
| low | `apiFetch` also logs failed responses to an in-app error log (`captureFailure` → `error-log-service`) on non-OK and on network error. Doc only describes the Bearer-attach behavior. Tangential to auth but part of the covered file. | `src/lib/api-fetch.ts:41-94` |
| low | `useAuth` token-save key uses an in-memory `_token` cache in addition to localStorage (`getAuthToken` reads memory first). Minor implementation detail not surfaced. | `src/lib/api-fetch.ts:11-22` |

## Spot-confirmed

- Single sign-in surface at `/auth`, middleware redirect scoped via matcher `["/api/:path*", "/auth", "/auth/:path*"]` and `loginUrl: "/auth"`. `src/middleware.ts:46,84`; verifier-exchange only runs for `/auth` + `/auth/*`. `src/middleware.ts:55-57`
- `?callbackURL=` honored and sanitized by `safeCallbackUrl` (rejects non-`/` and `//`, falls back to `/`). `src/app/auth/sign-in-form.tsx:18-23,28`
- Email sign-in via `signIn.email({ email, password, callbackURL })`; Google via `signIn.social({ provider: "google", callbackURL })` with inline Google SVG + "Continue with Google". `src/app/auth/sign-in-form.tsx:64-68,85,160-172`
- Auto-forward effect: guards `!sessionPending`, `session?.user`, `callbackURL !== "/"`, uses `window.location.replace`. `src/app/auth/sign-in-form.tsx:40-47`
- Sign-up: validates email present, password present, passwords match; `name.trim() || email.trim()`; on success `router.replace("/")` + `router.refresh()`. `src/app/auth/sign-up-form.tsx:44-74`
- Whitelist-aware error mapping substrings `not authorized` / `whitelist` / `not allowed` → "Please contact the administrator to request access." `src/app/auth/sign-up-form.tsx:28-38`
- Forgot password: `authClient.requestPasswordReset({ email, redirectTo })` with `redirectTo = <origin>/auth/reset-password`; always shows success ("Check your email", body "If an account exists for **{email}**…"). `src/app/auth/forgot-password-form.tsx:38-50,60-75`
- Reset password: validates non-empty, `password.length < 8` → "Password must be at least 8 characters", match; `authClient.resetPassword({ newPassword, token })`; on success `router.push("/auth?reset=success")`. `src/app/auth/reset-password-form.tsx:46-69`
- Invalid reset link panel when `!token`, "Request a new link" → `/auth/forgot-password`. `src/app/auth/reset-password-form.tsx:25-40`
- `reset=success` is pushed but never read by any auth code (doc's self-flagged caveat). Grep found only the push in `reset-password-form.tsx:69`; no reader. `src/app/auth/reset-password-form.tsx:69`
- `handleSignOut`: `stopEngine()` + `detachLifecycleListeners()`, sync-status store reset `{ lastError: null, isSyncing: false }`, `Promise.race(signOut(), 3000ms timeout)`, then `window.location.href = "/auth"`. `src/lib/sign-out.ts:6-21`
- `useAuth` returns `{ ready, authenticated, user }`; `user.name = "name" in user ? user.name : user.email`; bridges cookie + capacitor bearer validation against `/api/auth/validate`; runs once via `validated` ref. `src/components/auth-guard.tsx:17-63`
- `useAuthGate()` = `!ready || authenticated`. `src/components/auth-guard.tsx:65-68`. Consumers confirmed: voice-launch-bar, titration-drawer, indication-step, food-section, interactions-section, preset-tab, search-step, compound-list, medication-settings-view (reminders), add-medication-wizard — matching doc's "AI parsing, voice, interactions, dose reminders." `grep`
- `AuthGuard` is a pure pass-through `<>{children}</>`; no consumers in repo. `src/components/auth-guard.tsx:70-77`; grep found no external usage.
- AuthButton: `!ready` → disabled ghost, `text-muted-foreground/40`, `aria-label="Loading account"`; not-auth → User icon → `/profile`, active highlight `bg-primary/10 text-primary` when `pathname === "/profile"`; auth → initial avatar `(email?.[0] ?? "U").toUpperCase()` in `bg-primary/10` chip. `src/components/auth-button.tsx:20-71`
- AccountSection: `!ready` spinner (`Loader2 animate-spin`); not-auth "Not signed in" + "Sign in to unlock:" list (AI food & drink parsing / Dose reminder notifications / Cloud sync across devices) + "Sign In"; auth → email + "Signed in via Neon Auth" + outline red "Sign Out". `src/components/settings/account-section.tsx:13-74`
- SignedOutBlurb: "You're not signed in", bullets Cloud sync / AI insights & food parsing / Dose reminder notifications + "Sign In" (LogIn). `src/app/profile/page.tsx:14-44`
- `withAuth`: bearer-first then cookie; whitelist via `getAllowedEmails()` (split/trim/lowercase/filter), guarded by `allowedEmails.length > 0`; `ensureUserSynced` upsert `onConflictDoUpdate` when email else `onConflictDoNothing`, non-fatal; 401 `{ requiresAuth: true }`, 403 `{ accountUnapproved: true }`. `src/lib/auth-middleware.ts:22-191`
- `validateBearerToken`: requires `NEON_AUTH_URL`, 5000ms AbortController timeout, cookie `__Secure-neon-auth.session_token=<token>`, requires `user.id` + `user.email` else warns + null. `src/lib/auth-middleware.ts:37-69`
- `/api/auth/validate` returns `{ user: { id, email }, session: { userId } }`. `src/app/api/auth/validate/route.ts:4-9`
- Catch-all handler exports `GET, POST, PUT, DELETE, PATCH` from `auth.handler()`. `src/app/api/auth/[...path]/route.ts:19`
- `usersSync` = `neon_auth.users_sync { id text PK, email text (nullable) }`; every user table FKs with `onDelete: "cascade"`. `src/db/schema.ts:54-58` (+ 20 FK references)
- CORS: origins `https://localhost` / `http://localhost` / `capacitor://localhost`; methods `GET, POST, PUT, DELETE, OPTIONS`; headers `Content-Type, Authorization`; credentials `true`; max-age `86400`; OPTIONS → 204. `src/middleware.ts:4-15,63-68`
- Cookie secret min 32 chars; fallback placeholder `"neon-auth-placeholder-secret-not-for-production-use-12345678"` (60 chars, ≥32). `src/lib/neon-auth.ts:25-29`
- `isCapacitorMode()` = `!!process.env.NEXT_PUBLIC_API_BASE_URL`; localStorage key `capacitor_auth_token`. `src/lib/api-fetch.ts:1,29-31`
- AuthShell: `min-h-svh`, `bg-muted`, `p-6 md:p-10`, `max-w-sm`, Card `p-0` + CardContent `p-6 md:p-8`, Back ghost ArrowLeft → `router.back()`, footer "Your health data stays on your device. Sign in lets you sync across devices." `src/app/auth/auth-shell.tsx:20-39`
- Button label pairs: Sign In/"Signing in...", Create account/"Creating account...", Send reset link/"Sending...", Reset password/"Resetting...". `sign-in-form.tsx:143`, `sign-up-form.tsx:150`, `forgot-password-form.tsx:108`, `reset-password-form.tsx:121`
- Autocomplete tokens: `email`, `current-password` (sign-in), `name`/`new-password` (sign-up & reset). `sign-in-form.tsx:107,128`, `sign-up-form.tsx:96,109,122,135`, `reset-password-form.tsx:93,106`

## Low-confidence / could-not-verify

- **Neon Auth / Better Auth internal semantics** (e.g. "Better Auth accepts `resetPassword` with a valid token even when no password credential exists", and `auth.middleware`'s internal `exchangeOAuthToken`): these are claims about the `@neondatabase/auth` package internals, not about repo code. The repo wires them as described (`requestPasswordReset`/`resetPassword` calls, `auth.middleware({ loginUrl })`), but the package's runtime behavior was not inspected in `node_modules`. Confidence is based on the wiring being correct, not on the upstream guarantee.
- **`NEON_AUTH_COOKIE_SECRET` "real use still fails with placeholder"** (line 226): plausible and consistent with the code comment in `neon-auth.ts:18-23`, but not runtime-verified — depends on upstream signature validation rejecting the placeholder.
- **MCP authorize route as the `callbackURL` consumer** (lines 32, 36): the auth code honors `callbackURL` generically; the specific MCP-authorize usage is asserted by comments but the MCP route was outside the covered file set and not read here.
