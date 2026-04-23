"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/**
 * Browser-side Neon Auth client.
 *
 * Consumed by:
 *   - /auth page (sign-in, sign-up)
 *   - src/components/auth-button.tsx (sign out)
 *   - src/components/auth-guard.tsx (useAuth hook wraps useSession)
 *   - src/components/settings/account-section.tsx (email display + sign out)
 *
 * Same-origin cookies travel automatically — no Bearer tokens needed.
 * Per D-06, we never attach Authorization headers from the client. The
 * Neon Auth catch-all handler at /api/auth/[...path] sets an httpOnly
 * signed cookie on sign-in that every subsequent same-origin fetch sends
 * automatically.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
