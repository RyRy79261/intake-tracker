import type { VerificationResult } from "./privy-server";

/**
 * Body shape returned by withAuth on rejection.
 *
 * - `requiresAuth: true` → client should reopen the sign-in modal.
 *   Used for missing/expired tokens or misconfigured server.
 * - `accountUnapproved: true` → user authenticated successfully but their
 *   email/wallet is not on the allow-list. Re-logging in won't help —
 *   the client should surface an "approval pending / contact admin"
 *   state and avoid the logout-retry loop.
 */
export interface AuthErrorBody {
  error: string;
  requiresAuth?: true;
  accountUnapproved?: true;
}

export interface AuthErrorResponse {
  status: number;
  body: AuthErrorBody;
}

/**
 * Maps a failed VerificationResult to the HTTP shape clients consume.
 * Whitelist denials get 403 + accountUnapproved; all token/config
 * failures get 401 + requiresAuth so the client knows to re-auth.
 */
export function verificationToErrorResponse(
  result: VerificationResult
): AuthErrorResponse {
  if (result.success) {
    throw new Error(
      "verificationToErrorResponse called with a successful result"
    );
  }

  const error = result.error ?? "Unauthorized";

  if (result.reason === "not-whitelisted") {
    return {
      status: 403,
      body: { error, accountUnapproved: true },
    };
  }

  return {
    status: 401,
    body: { error, requiresAuth: true },
  };
}

/**
 * Body shape returned by GET /api/ai/access. Always 200; the client
 * inspects the fields to decide what to render.
 */
export interface AccessStatusBody {
  signedIn: boolean;
  approved: boolean;
  email?: string;
  reason?: string;
}

/**
 * Maps a VerificationResult to the access-probe body. Whitelist denials
 * keep `signedIn: true` (the token was valid, the user just isn't
 * approved); token failures collapse to `signedIn: false`.
 */
export function verificationToAccessResponse(
  result: VerificationResult
): AccessStatusBody {
  if (result.success) {
    return {
      signedIn: true,
      approved: true,
      ...(result.email && { email: result.email }),
    };
  }

  return {
    signedIn: result.reason === "not-whitelisted",
    approved: false,
    ...(result.error && { reason: result.error }),
  };
}
