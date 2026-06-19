/**
 * POST /api/native-auth/claim — native Google sign-in code exchange.
 *
 * The Capacitor app calls this after catching the App Link return
 * (`/auth/native-done?code=…`). The one-time `code` is the credential; it is
 * traded once for the Neon session token, which the app then uses on its
 * Authorization: Bearer path. No session/auth required — the code IS the proof.
 *
 * CORS for the app's `https://localhost` WebView origin is applied by the
 * root middleware (`/api/:path*`). Deliberately NOT under `/api/auth/*` so it
 * doesn't collide with the Neon Auth catch-all handler.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import { claimNativeAuthCode } from "@/lib/native-auth-bridge";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" } as const;

const schema = z.object({ code: z.string().min(1).max(512) });

// Best-effort, per-instance limiter (resets on cold start — see _shared/rate-limit).
// The code is a 256-bit, 60s, single-use credential, so this is defense-in-depth
// + consistency with the other public endpoints, not the primary guard.
const rateLimiter = createRateLimiter(10);

export async function POST(request: NextRequest) {
  if (!rateLimiter.check(getClientIp(request))) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: NO_STORE },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: NO_STORE },
    );
  }

  const sessionToken = await claimNativeAuthCode(parsed.data.code);
  if (!sessionToken) {
    // Unknown, already-claimed, or expired code.
    return NextResponse.json(
      { error: "invalid_grant" },
      { status: 400, headers: NO_STORE },
    );
  }

  return NextResponse.json(
    { token: sessionToken },
    { status: 200, headers: NO_STORE },
  );
}
