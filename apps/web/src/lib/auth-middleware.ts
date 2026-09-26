import "server-only";
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/neon-auth";
import { db } from "@intake/db/client";
import { usersSync } from "@intake/db/schema";

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

function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Thrown by {@link validateBearerToken} when Neon Auth could not answer (5xx,
 * timeout, network error, or no NEON_AUTH_URL configured). It says nothing
 * about the token, so callers must NOT treat it as "signed out": withAuth
 * returns 503 and the native client keeps its token (audit native-android#5).
 */
export class AuthUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthUpstreamError";
  }
}

/**
 * Resolve a Neon Auth session token to its user.
 *
 * Returns null only when the upstream rejects the token (401/403, or a 200
 * with no session — Better Auth's reply for an unknown token). Throws
 * {@link AuthUpstreamError} when the upstream is unavailable.
 */
export async function validateBearerToken(
  token: string
): Promise<{ userId: string; email: string } | null> {
  const baseUrl = process.env.NEON_AUTH_URL;
  if (!baseUrl) throw new AuthUpstreamError("NEON_AUTH_URL is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/auth/get-session`, {
      headers: {
        cookie: `__Secure-neon-auth.session_token=${token}`,
      },
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    throw new AuthUpstreamError(
      `get-session request failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  try {
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) throw new AuthUpstreamError(`get-session returned ${res.status}`);

    let body: { session?: { user?: unknown }; user?: unknown } | null;
    try {
      body = await res.json();
    } catch {
      console.warn("Bearer auth: upstream returned unexpected session shape");
      return null;
    }
    const user = (body?.session?.user ?? body?.user) as
      | { id?: string; email?: string }
      | undefined;
    if (!user?.id || !user?.email) {
      console.warn("Bearer auth: upstream returned unexpected session shape");
      return null;
    }

    return { userId: user.id, email: user.email };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Mirror the authenticated user into neon_auth.users_sync.
 *
 * Every user-scoped table FKs to users_sync(id); Neon Auth's hosted sync was
 * never enabled on this database, so nothing else populates it. Run before
 * the handler so any user-scoped insert downstream finds its parent row.
 *
 * Failures are logged but not fatal: read routes don't need the row, and a
 * write route that does will surface the FK error on its own insert.
 */
export async function ensureUserSynced(userId: string, email?: string): Promise<void> {
  try {
    if (email) {
      await db
        .insert(usersSync)
        .values({ id: userId, email })
        .onConflictDoUpdate({ target: usersSync.id, set: { email } });
    } else {
      await db.insert(usersSync).values({ id: userId }).onConflictDoNothing();
    }
  } catch (e) {
    console.error("[auth] users_sync upsert failed:", e);
  }
}

/**
 * Higher-order function that wraps an API route handler with authentication.
 *
 * On failure, returns:
 *   - 401 + { requiresAuth: true } for missing/expired tokens (client
 *     should reopen the sign-in modal)
 *   - 503 when Neon Auth could not validate a Bearer token (outage or
 *     timeout) — the token may still be good, so clients must keep it
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
    const bearerToken = extractBearerToken(request);

    if (bearerToken) {
      let result: Awaited<ReturnType<typeof validateBearerToken>>;
      try {
        result = await validateBearerToken(bearerToken);
      } catch (e) {
        if (!(e instanceof AuthUpstreamError)) throw e;
        console.error("[auth] Bearer validation unavailable:", e.message);
        return NextResponse.json(
          { error: "Authentication service unavailable" },
          { status: 503, headers: { "Retry-After": "5" } }
        );
      }
      if (!result) {
        return NextResponse.json(
          { error: "Invalid or expired token", requiresAuth: true },
          { status: 401 }
        );
      }

      const userEmail = result.email.toLowerCase();
      const allowedEmails = getAllowedEmails();

      if (
        allowedEmails.length > 0 &&
        !allowedEmails.includes(userEmail)
      ) {
        return NextResponse.json(
          {
            error: "Your account is not authorized to use this app",
            accountUnapproved: true,
          },
          { status: 403 }
        );
      }

      await ensureUserSynced(result.userId, userEmail);

      return handler({
        request,
        auth: {
          success: true,
          userId: result.userId,
          email: userEmail,
        },
      });
    }

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

    if (
      allowedEmails.length > 0 &&
      (!userEmail || !allowedEmails.includes(userEmail))
    ) {
      return NextResponse.json(
        {
          error: "Your account is not authorized to use this app",
          accountUnapproved: true,
        },
        { status: 403 }
      );
    }

    await ensureUserSynced(userId, userEmail);

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
