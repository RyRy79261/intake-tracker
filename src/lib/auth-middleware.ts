import { NextRequest, NextResponse } from "next/server";
import { verifyAndCheckWhitelist, type VerificationResult } from "./privy-server";
import { verificationToErrorResponse } from "./auth-response";

export interface AuthenticatedRequest {
  request: NextRequest;
  auth: VerificationResult;
}

type AuthenticatedHandler = (
  ctx: AuthenticatedRequest
) => Promise<NextResponse> | NextResponse;

/**
 * Higher-order function that wraps an API route handler with authentication.
 *
 * On failure, returns:
 *   - 401 + { requiresAuth: true } for missing/expired tokens (client
 *     should reopen the sign-in modal)
 *   - 403 + { accountUnapproved: true } for whitelist denials (client
 *     should surface "contact admin" — re-auth won't help)
 *
 * Usage:
 * ```ts
 * export const POST = withAuth(async ({ request, auth }) => {
 *   // auth.userId, auth.email available
 *   return NextResponse.json({ ok: true });
 * });
 * ```
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authHeader = request.headers.get("Authorization");
    const authToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    const result = await verifyAndCheckWhitelist(authToken);

    if (!result.success) {
      const { status, body } = verificationToErrorResponse(result);
      return NextResponse.json(body, { status });
    }

    return handler({ request, auth: result });
  };
}
