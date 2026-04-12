import { NextRequest, NextResponse } from "next/server";
import { auth } from "./neon-auth";

/**
 * Result of authenticating a request via Neon Auth.
 *
 * Shape preserved from the pre-Phase-41 Privy-based withAuth contract so the
 * 9 existing API routes that destructure `auth.userId!` and `auth.email` need
 * zero changes.
 */
export interface VerificationResult {
  success: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

export interface AuthenticatedRequest {
  request: NextRequest;
  auth: VerificationResult;
}

type AuthenticatedHandler = (
  ctx: AuthenticatedRequest
) => Promise<NextResponse> | NextResponse;

/**
 * Parse the ALLOWED_EMAILS whitelist from env.
 *
 * Empty whitelist intentionally allows any authenticated email (preserves the
 * Privy dev-mode behavior from the old privy-server.ts lines 118-127 so local
 * dev branches without a whitelist configured keep working).
 */
function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Higher-order function that wraps an API route handler with Neon Auth session
 * verification + ALLOWED_EMAILS whitelist enforcement.
 *
 * Session is read from the signed Neon Auth cookie set during sign-in. There
 * is no Bearer token plumbing anywhere in the request path — clients simply
 * make same-origin fetch calls and cookies travel automatically.
 *
 * Usage (unchanged from the pre-Phase-41 Privy contract):
 * ```ts
 * export const POST = withAuth(async ({ request, auth }) => {
 *   // auth.userId! is guaranteed on success
 *   // auth.email is defined if the user signed in with email
 *   return NextResponse.json({ ok: true });
 * });
 * ```
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const { data: session } = await auth.getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: "No active session", requiresAuth: true },
        { status: 401 }
      );
    }

    const userEmail = session.user.email?.toLowerCase();
    const userId = session.user.id;
    const allowedEmails = getAllowedEmails();

    // Whitelist check — empty whitelist allows any authenticated email
    // (preserves current Privy behavior from privy-server.ts lines 118-127).
    if (
      allowedEmails.length > 0 &&
      (!userEmail || !allowedEmails.includes(userEmail))
    ) {
      return NextResponse.json(
        {
          error: "Your account is not authorized to use this app",
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    return handler({
      request,
      auth: {
        success: true,
        userId,
        ...(userEmail !== undefined && { email: userEmail }),
      },
    });
  };
}
