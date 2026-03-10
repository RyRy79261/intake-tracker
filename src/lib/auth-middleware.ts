import { NextRequest, NextResponse } from "next/server";
import { verifyAndCheckWhitelist, type VerificationResult } from "./privy-server";

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
    // Production guard: never allow LOCAL_AGENT_MODE bypass in production
    if (
      process.env.NEXT_PUBLIC_LOCAL_AGENT_MODE === "true" &&
      process.env.NODE_ENV === "production"
    ) {
      console.warn(
        "LOCAL_AGENT_MODE is enabled in production — ignoring it. " +
          "Remove NEXT_PUBLIC_LOCAL_AGENT_MODE from your production environment."
      );
    }

    // Extract Bearer token from Authorization header
    const authHeader = request.headers.get("Authorization");
    const authToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    const result = await verifyAndCheckWhitelist(authToken);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Unauthorized", requiresAuth: true },
        { status: 401 }
      );
    }

    return handler({ request, auth: result });
  };
}
