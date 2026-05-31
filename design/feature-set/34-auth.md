# 34 — Auth Flows

**Files covered:**
- `src/app/auth/page.tsx` — Sign-in page (root auth surface)
- `src/app/auth/sign-up/page.tsx` — Sign-up page
- `src/app/auth/forgot-password/page.tsx` — Forgot-password page
- `src/app/auth/reset-password/page.tsx` — Reset-password page
- `src/app/auth/auth-shell.tsx` — Shared card/back-button shell for all auth screens
- `src/app/auth/sign-in-form.tsx` — Email + Google sign-in form
- `src/app/auth/sign-up-form.tsx` — Email/password registration form
- `src/app/auth/forgot-password-form.tsx` — Request-reset-email form
- `src/app/auth/reset-password-form.tsx` — Set-new-password form
- `src/components/auth-button.tsx` — Header account control / profile tab
- `src/components/auth-guard.tsx` — `useAuth`, `useAuthGate`, `AuthGuard` (client session hooks)
- `src/lib/auth-client.ts` — Neon Auth (Better Auth) client + capacitor token wiring
- `src/lib/auth-middleware.ts` — `withAuth` HOF (server route auth + whitelist)
- `src/lib/neon-auth.ts` — Server-side Neon Auth instance
- `src/lib/sign-out.ts` — `handleSignOut` (stops sync, clears token, redirects)
- `src/middleware.ts` — Edge middleware (OAuth verifier exchange + CORS + login redirect)
- `src/app/api/auth/[...path]/route.ts` — Catch-all Neon Auth handler
- `src/app/api/auth/validate/route.ts` — Bearer-token validate endpoint (capacitor)
- `src/components/settings/account-section.tsx` — Account block on profile page
- `src/app/profile/page.tsx` — Profile route (signed-out blurb + account section)
- `src/lib/api-fetch.ts` — `isCapacitorMode`, token save/get/clear, `apiFetch`

**Purpose:** Authentication for a single-user, offline-first PWA. Provides email/password and Google OAuth sign-in/up, password reset/forgot, session management, an allow-list (whitelist) gate, and per-route server auth via `withAuth`. The app works offline on-device without login; signing in unlocks cloud sync, AI features, and dose-reminder notifications.

---

## Features

- **Single sign-in surface at `/auth`.** Middleware redirects every unauthenticated *protected* page request here (login redirect is scoped to `/auth` + `/auth/*` matcher; most pages are client-gated). `?callbackURL=` query param is honored as the post-sign-in target (used by the MCP authorize route to return the user after Google sign-in).
- **Email/password sign-in** via `signIn.email({ email, password, callbackURL })`.
- **Google OAuth sign-in** via `signIn.social({ provider: "google", callbackURL })`. Branded "Continue with Google" button with inline Google SVG glyph.
- **OAuth verifier exchange:** After Google returns the user to `/auth?neon_auth_session_verifier=<token>`, the edge middleware (`auth.middleware({ loginUrl: "/auth" })`) exchanges the verifier server-side for the real session cookie. Without it no session cookie materializes and every subsequent request 401s.
- **Auto-forward on active session + pending callbackURL:** If a user lands on `/auth` already authenticated AND a non-`/` `callbackURL` is present, the form hard-navigates (`window.location.replace`) to that URL (handles social-login returns and API-route callbacks like the MCP authorize endpoint that `router.push` can't reach).
- **Email/password sign-up** via `signUp.email({ email, password, name, callbackURL })`. Optional display name (defaults to email if blank). Confirm-password match enforced client-side.
- **Whitelist-aware sign-up errors:** Server errors containing "not authorized" / "whitelist" / "not allowed" are rewritten to a friendly "Please contact the administrator to request access." message.
- **Forgot password:** Requests a reset email via `authClient.requestPasswordReset({ email, redirectTo })` where `redirectTo = <origin>/auth/reset-password`.
- **User-enumeration prevention:** Forgot-password always shows the success state ("Check your email") regardless of whether the account exists.
- **Forgot-password doubles as "set initial password"** for Google-only users who never set a password (Better Auth accepts `resetPassword` with a valid token even when no password credential exists).
- **Reset password:** Completes via `authClient.resetPassword({ newPassword, token })` using the `token` query param from the email link. On success pushes to `/auth?reset=success`.
- **Invalid reset link state:** When the `token` param is missing, renders a "Invalid reset link" panel instead of the form, with a "Request a new link" button.
- **Sign-out:** `handleSignOut()` stops the sync engine, detaches lifecycle listeners, resets sync-status store, races `signOut()` against a 3s timeout, then hard-redirects to `/auth`.
- **Session hook `useAuth()`:** Returns `{ ready, authenticated, user }`. `user` = `{ id, email, name }` (name falls back to email). Bridges web cookie session and capacitor bearer-token session.
- **Capacitor (native shell) bearer-token auth:** In capacitor mode a bearer token is persisted (to a module-level in-memory `_token` cache **and** localStorage key `capacitor_auth_token`) on successful sign-in/up/social, via two different mechanisms: `signIn.email` and `signIn.social` are Proxy-wrapped in `auth-client.ts` to call `saveAuthToken` automatically, while `signUp` is **not** proxied — the sign-up form component itself calls `saveAuthToken(result.data.token)` inline before `router.replace("/")`. `useAuth` validates the token against `/api/auth/validate`; `apiFetch` attaches `Authorization: Bearer <token>` (token read memory-first via `getAuthToken`).
- **Feature gate `useAuthGate()`:** Returns `!ready || authenticated` — used across the app to optimistically show AI features while session is still loading or when authenticated (gates AI parsing, voice, interactions, dose reminders).
- **Header account control (`AuthButton`):** Shows a user-initial avatar when signed in, a generic user icon when not. Always navigates to `/profile`. Highlights when `/profile` is the active route.
- **Profile account section:** Shows signed-in email + "Signed in via Neon Auth" + Sign Out; or a "Not signed in" upsell list + Sign In button.
- **Server route protection (`withAuth`):** HOF wrapping API handlers; resolves user from bearer token (capacitor) or cookie session (web), enforces whitelist, upserts the user into `neon_auth.users_sync`, then calls the handler with `auth.userId` / `auth.email`.
- **`users_sync` mirroring:** Every authenticated request upserts `{ id, email }` into `usersSync` so user-scoped FK inserts downstream find their parent row (Neon Auth hosted sync was never enabled on this DB).
- **Validate endpoint (`GET /api/auth/validate`):** Returns `{ user: { id, email }, session: { userId } }` for a valid bearer/cookie session (used by capacitor `useAuth`).
- **`apiFetch` failure logging:** Beyond attaching the bearer token, `apiFetch` records failed calls to the in-app error log (`captureFailure` → `error-log-service.logError("api-error", …)`) on any non-OK response and on network/fetch errors. Fire-and-forget (dynamic import, never blocks or throws); network errors are still re-thrown to the caller.
- **Catch-all Neon Auth proxy (`/api/auth/[...path]`):** Single mount point proxying `sign-in/email`, `sign-up/email`, `sign-out`, `get-session`, `callback/google`, etc.
- **Safety copy:** AuthShell footer always states "Your health data stays on your device. Sign in lets you sync across devices."

---

## User actions & interactions

**AuthShell (all screens):**
- Tap **Back** (ghost button, ArrowLeft icon) → `router.back()`.

**Sign-in form (`/auth`):**
- Type into **Email** input (`type=email`, `autoComplete=email`, `placeholder="you@example.com"`, required).
- Type into **Password** input (`type=password`, `autoComplete=current-password`, required).
- Tap **"Forgot your password?"** link (top-right of password label) → `/auth/forgot-password`.
- Submit form (Enter or **Sign In** button) → email sign-in; on success in capacitor mode `router.replace(callbackURL)`; in web mode the session cookie + auto-forward effect handle navigation.
- Tap **Continue with Google** → social OAuth flow.
- Tap **Sign up** link → `/auth/sign-up`.
- All inputs/buttons disabled while `loading`.

**Sign-up form (`/auth/sign-up`):**
- Type into **Name (optional)**, **Email**, **Password** (`new-password`), **Confirm password** (`new-password`).
- Submit (**Create account**) → validates email present, password present, passwords match; calls `signUp.email`; on success (in capacitor mode, first saves the returned bearer token via `saveAuthToken(result.data.token)`) → `router.replace("/")` + `router.refresh()`.
- Tap **Sign in** link → `/auth`.

**Forgot-password form (`/auth/forgot-password`):**
- Type **Email**.
- Submit (**Send reset link**) → request reset email; on success swaps to "Check your email" panel.
- Tap **Back to sign in** link → `/auth`.
- In success panel: tap **Back to sign in** (outline button) → `/auth`.

**Reset-password form (`/auth/reset-password?token=…`):**
- Type **New password** + **Confirm new password** (`new-password`).
- Submit (**Reset password**) → validates non-empty, ≥8 chars, match; calls `resetPassword`; on success `/auth?reset=success`.
- Tap **Back to sign in** link → `/auth`.
- Invalid-link state: tap **Request a new link** → `/auth/forgot-password`.

**Header / profile:**
- Tap **AuthButton** (avatar or user icon) → `/profile`.
- On profile, tap **Sign In** → `/auth`.
- On profile (signed in), tap **Sign Out** → `handleSignOut()` → hard redirect to `/auth`.

---

## States & presentations

**Shared shell:** Centered card (`max-w-sm`) on `bg-muted`, full-height (`min-h-svh`), padded `p-6 md:p-10`. Card has no padding except inner `CardContent` (`p-6 md:p-8`). Back button above card; helper footer text below.

**Sign-in form:**
- **Default:** "Welcome back" heading + subtext "Sign in to your Intake Tracker account"; email + password fields; Sign In button; "Or continue with" divider; Google button; sign-up prompt.
- **Loading (submitting):** All fields/buttons `disabled`; Sign In button label → "Signing in...".
- **Validation error:** Inline `text-destructive` `role="alert"` paragraph — "Email is required" / "Password is required".
- **Auth error:** Server `error.message` (or "Sign in failed").
- **Google error:** "Google sign in failed" (or thrown message).
- **Authenticated + callbackURL pending:** No form interaction — auto-forwards via `window.location.replace`.

**Sign-up form:**
- **Default:** "Create an account" + "Start tracking your health data on Intake Tracker"; name/email/password/confirm fields.
- **Loading:** Disabled fields; button label → "Creating account...".
- **Validation errors:** "Email is required" / "Password is required" / "Passwords do not match".
- **Whitelist denial:** Friendly "Please contact the administrator to request access."
- **Other server error:** Verbatim message (or "Sign up failed").

**Forgot-password form:**
- **Default:** "Forgot your password?" + "Enter your email and we'll send you a link to reset it."
- **Loading:** Button label → "Sending..."; email disabled.
- **Validation error:** "Email is required".
- **Server error:** `error.message` (or "Could not send reset email").
- **Sent / success:** "Check your email" heading; body "If an account exists for **{email}**, we've sent a link to reset your password. The link will expire shortly."; outline "Back to sign in" button. (Always shown on success regardless of account existence.)

**Reset-password form:**
- **Missing token:** "Invalid reset link" panel + "Request a new link" button (form not rendered).
- **Default (token present):** "Set a new password" + "Choose a strong password you don't use anywhere else."
- **Loading:** Button label → "Resetting..."; fields disabled.
- **Validation errors:** "Password is required" / "Password must be at least 8 characters" / "Passwords do not match".
- **Server error:** `error.message` (or "Could not reset password").
- **Success:** Navigates to `/auth?reset=success` (NOTE: the sign-in form does **not** currently read/display the `reset=success` param — there is no success banner on the sign-in page; a redesign could add one).

**AuthButton (header):**
- **Loading (`!ready`):** Disabled ghost icon button; muted User icon (`text-muted-foreground/40`); `aria-label="Loading account"`.
- **Not authenticated:** Ghost User icon button → `/profile`; highlights (`bg-primary/10 text-primary`) when `/profile` active.
- **Authenticated:** Circular initial avatar (uppercase first char of email, fallback "U") in a `bg-primary/10` chip; same active highlight.

**Account section (profile):**
- **Loading (`!ready`):** Centered spinner (`Loader2 animate-spin`).
- **Not signed in:** "Not signed in" card with "Sign in to unlock:" list (AI food & drink parsing, Dose reminder notifications, Cloud sync across devices) + full-width "Sign In" button.
- **Signed in:** Email + "Signed in via Neon Auth" card + outline red "Sign Out" button.

**Profile page signed-out blurb (`SignedOutBlurb`):** "You're not signed in" card; "Your profile works on this device offline. Signing in also unlocks:" with bullets (Cloud sync, AI insights & food parsing, Dose reminder notifications) + "Sign In" button (LogIn icon).

**Server-route auth states (consumed by client to drive UI):**
- **401 `{ requiresAuth: true }`** — missing/expired token or no session → client should reopen sign-in.
- **403 `{ accountUnapproved: true }`** — whitelist denial → "contact admin" (re-auth won't help).
- **Success** — handler runs with `auth.userId` / `auth.email`.

---

## Enums, options & configurable values

**Auth screens / routes:**
- `/auth` (sign-in), `/auth/sign-up`, `/auth/forgot-password`, `/auth/reset-password`, `/profile`.

**Sign-in providers:**
- Email/password.
- Social provider: `"google"` (only one wired).

**Field autocomplete tokens:** `email`, `current-password` (sign-in), `name` / `new-password` (sign-up & reset).

**Button label state pairs:**
- Sign In ↔ "Signing in..."
- Create account ↔ "Creating account..."
- Send reset link ↔ "Sending..."
- Reset password ↔ "Resetting..."

**Validation messages (exact strings):**
- "Email is required", "Password is required", "Passwords do not match", "Password must be at least 8 characters".

**Whitelist trigger substrings (lowercased match):** `"not authorized"`, `"whitelist"`, `"not allowed"` → mapped to "Please contact the administrator to request access."

**`useAuth()` return shape:** `{ ready: boolean, authenticated: boolean, user: { id, email, name } | null }`.

**`useAuthGate()`:** returns `boolean` = `!ready || authenticated`.

**Server auth response flags:** `{ requiresAuth: true }` (401), `{ accountUnapproved: true }` (403).

**Thresholds / limits:**
- Reset-password minimum length: **8 characters** (client-side).
- Cookie secret minimum: **32 characters** (Neon Auth requirement; `neon-auth.ts` pads a fallback).
- Bearer-token validation upstream fetch timeout: **5000 ms** (AbortController).
- Sign-out `signOut()` race timeout: **3000 ms**.
- CORS `Access-Control-Max-Age`: **86400** seconds.

**Allowed CORS origins (capacitor):** `https://localhost`, `http://localhost`, `capacitor://localhost`.
**CORS methods:** `GET, POST, PUT, DELETE, OPTIONS`. **Headers:** `Content-Type, Authorization`. Credentials allowed.

**Capacitor bearer cookie name (upstream session):** `__Secure-neon-auth.session_token`.
**Capacitor token localStorage key:** `capacitor_auth_token`.

**Env vars:** `ALLOWED_EMAILS` (comma-separated whitelist), `NEON_AUTH_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEXT_PUBLIC_API_BASE_URL` (presence ⇒ capacitor mode).

**Middleware matcher:** `["/api/:path*", "/auth", "/auth/:path*"]`. Neon Auth `loginUrl`: `/auth`.

**Catch-all Neon Auth handler exports:** `GET, POST, PUT, DELETE, PATCH`.

**Query params honored:**
- `callbackURL` (sign-in / sign-up / Google) — sanitized by `safeCallbackUrl`.
- `token` (reset-password).
- `neon_auth_session_verifier` (OAuth return; consumed by middleware).
- `reset=success` (pushed after reset; currently not surfaced).

---

## Data model touched

- **`neon_auth.users_sync` (`usersSync`, `src/db/schema.ts`):** `withAuth` upserts `{ id, email }` on every authenticated request (`onConflictDoUpdate` when email present, else `onConflictDoNothing`). Every user-scoped table FKs to `users_sync(id)`.
- **Neon Auth session/user objects** (from `@neondatabase/auth`): `session.user.{ id, email, name }`.
- **Bearer token (capacitor only):** persisted to localStorage key `capacitor_auth_token` and mirrored in a module-level in-memory `_token` cache (`api-fetch.ts`); `getAuthToken` returns the memory copy first, falling back to localStorage.
- **No Dexie tables** are written by the auth flow itself; auth gates downstream sync of all Dexie domains.
- **`sync-status-store` (Zustand):** `handleSignOut` resets `{ lastError: null, isSyncing: false }`.
- **Sync engine:** `handleSignOut` calls `stopEngine()` + `detachLifecycleListeners()`.

---

## Validation, edge cases & business rules

- **`safeCallbackUrl`:** Only accepts same-origin relative paths. Rejects absolute URLs (cross-origin redirect attack), protocol-relative `//evil.example`, and anything not starting with a single `/` — falls back to `/`.
- **Auto-forward guard:** Only forwards when session resolved (`!sessionPending`), `session.user` present, and `callbackURL !== "/"`. Uses `window.location.replace` (not `router.push`) because callbackURL may be an API route (MCP authorize).
- **Capacitor vs web sign-in success:** capacitor mode strips `callbackURL` from the call and explicitly `router.replace(callbackURL)`; web mode relies on cookie + auto-forward effect.
- **Sign-up name default:** `name.trim() || email.trim()`.
- **Whitelist enforcement is server-side only** (`withAuth` via `ALLOWED_EMAILS`); forms only friendly-map the resulting error. If `ALLOWED_EMAILS` is empty, no whitelist restriction is applied (`allowedEmails.length > 0` guard). Email comparison is lowercased + trimmed.
- **User-enumeration prevention:** Forgot-password shows success regardless of account existence; whitelist is enforced at the API boundary, not in the forgot form.
- **Reset token:** Read from URL query param; missing token short-circuits to the invalid-link panel. Min length 8 enforced before submit.
- **Bearer validation:** Empty/whitespace token rejected; requires a `Bearer` prefix (with trailing space); upstream session shape must include `user.id` + `user.email` (else warns + rejects). Network/timeout failures return `null` ⇒ 401.
- **`ensureUserSynced` is non-fatal:** Failures logged, not thrown — read routes don't need the row; a write route surfaces the FK error itself.
- **Cookie secret fallback:** `neon-auth.ts` pads a 32-char placeholder so the module is import-safe in tests/dev; real use (sign-in, getSession) still fails because nothing signed with the placeholder validates. Production MUST set `NEON_AUTH_COOKIE_SECRET`.
- **Middleware scoping:** Neon Auth verifier-exchange middleware runs ONLY for `/auth` + `/auth/*` (so public MCP endpoints stay unauthenticated); CORS layer runs for `/api/*` from allowed capacitor origins (204 on OPTIONS preflight).
- **Sign-out resilience:** Races `signOut()` against 3s timeout; redirects to `/auth` even on timeout/network failure (token already cleared, engine already stopped).
- **`useAuth` capacitor validation runs once** (`validated` ref) and only when not already cookie-authenticated and a token exists; clears the token if `/api/auth/validate` returns no user.
- **Offline-first:** The app and profile work without sign-in; auth only unlocks sync, AI, and notifications. `useAuthGate` returns `true` while session is still loading (optimistic AI display).

---

## Sub-components / variants

- `AuthShell` — Shared centered card + Back button + on-device-data footer for all four auth screens.
- `AuthPage` (`/auth/page.tsx`) — Wraps `SignInForm` in `<Suspense>` (needed for `useSearchParams`).
- `SignInForm` — Email + Google sign-in; callbackURL handling + auto-forward effect.
- `SignUpForm` — Email/password registration with whitelist-aware error mapping.
- `ForgotPasswordForm` — Request-reset-email; dual default/sent states.
- `ResetPasswordForm` — Set new password; invalid-link vs form states.
- `ForgotPasswordPage` / `SignUpPage` / `ResetPasswordPage` — Thin route wrappers around AuthShell + the matching form (reset page wraps in `<Suspense>` for the `token` param).
- `AuthButton` — Header account control / `/profile` nav tab; loading / signed-out / signed-in variants.
- `AccountSection` — Profile account block; loading / not-signed-in upsell / signed-in (email + sign-out).
- `SignedOutBlurb` — Profile-page upsell shown when signed out.
- `useAuth` — Client session hook bridging cookie + capacitor bearer sessions.
- `useAuthGate` — Boolean feature gate (optimistic during load).
- `AuthGuard` — Currently a pass-through wrapper (`<>{children}</>`); kept for API stability.
- `withAuth` — Server HOF: bearer/cookie resolution, whitelist, `users_sync` upsert.
- `auth` (`neon-auth.ts`) — Server Neon Auth instance (createNeonAuth).
- `authClient` / `signIn` / `signOut` (`auth-client.ts`) — Client Neon Auth. `signIn.email` and `signIn.social` are Proxy-wrapped to auto-save the capacitor bearer token; `signOut` clears it. `signUp` is exported un-proxied (the sign-up form saves the token inline instead).
- `handleSignOut` — Stops sync, clears token, redirects.
- `middleware` — OAuth verifier exchange + capacitor CORS + login redirect.
- `[...path]` Neon Auth handler — Proxies all Neon Auth endpoints.
- `GET /api/auth/validate` — Bearer/cookie session validation for capacitor `useAuth`.
