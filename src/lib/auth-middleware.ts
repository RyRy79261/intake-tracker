import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/neon-auth";
import { db } from "@/lib/drizzle";
import { usersSync } from "@/db/schema";

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

async function validateBearerToken(
  token: string
): Promise<{ userId: string; email: string } | null> {
  const baseUrl = process.env.NEON_AUTH_URL;
  if (!baseUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${baseUrl}/api/auth/get-session`, {
      headers: {
        cookie: `__Secure-neon-auth.session_token=${token}`,
      },
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const body = await res.json();
    const user = body?.session?.user ?? body?.user;
    if (!user?.id || !user?.email) {
      console.warn("Bearer auth: upstream returned unexpected session shape");
      return null;
    }

    return { userId: user.id, email: user.email };
  } catch {
    return null;
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
async function ensureUserSynced(userId: string, email?: string): Promise<void> {
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
      const result = await validateBearerToken(bearerToken);
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
            requiresAuth: true,
          },
          { status: 401 }
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
          requiresAuth: true,
        },
        { status: 401 }
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
