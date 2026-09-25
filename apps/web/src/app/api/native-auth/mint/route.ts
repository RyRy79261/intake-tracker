/**
 * POST /api/native-auth/mint — mint a one-time native sign-in code.
 *
 * Called by the /native-auth/bridge page from inside the system-browser Custom
 * Tab, AFTER Neon Auth's middleware has exchanged the OAuth verifier and set the
 * session cookie. Reads that session cookie server-side (it is HttpOnly, so only
 * the server can), confirms it, and mints a one-time code bound to it. The page
 * then hands the code to the app via an HTTPS App Link.
 *
 * Cookie-authenticated, same-origin. The session cookie is `__Secure` +
 * SameSite, so a cross-site POST cannot present it (CSRF-safe); and even if a
 * code were minted, the response is not readable cross-origin.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AuthUpstreamError,
  ensureUserSynced,
  validateBearerToken,
} from "@/lib/auth-middleware";
import { mintNativeAuthCode } from "@/lib/native-auth-bridge";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" } as const;

const SESSION_COOKIE = "__Secure-neon-auth.session_token";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let session: Awaited<ReturnType<typeof validateBearerToken>> = null;
  if (token) {
    try {
      session = await validateBearerToken(token);
    } catch (e) {
      if (!(e instanceof AuthUpstreamError)) throw e;
      console.error("[native-auth/mint] session validation unavailable:", e.message);
      return NextResponse.json(
        { error: "auth_unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }
  }
  if (!token || !session) {
    return NextResponse.json(
      { error: "no_session" },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    // native_auth_codes.user_id references users_sync, and a first-ever
    // sign-in via the Android bridge reaches here before any withAuth route
    // has mirrored the user (audit mcp-server-auth#14).
    await ensureUserSynced(session.userId, session.email.toLowerCase());
    const code = await mintNativeAuthCode({
      sessionToken: token,
      userId: session.userId,
    });
    return NextResponse.json({ code }, { status: 200, headers: NO_STORE });
  } catch (e) {
    console.error("[native-auth/mint] failed to mint code:", e);
    return NextResponse.json(
      { error: "mint_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
