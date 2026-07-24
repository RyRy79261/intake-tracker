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
import { validateBearerToken } from "@/lib/auth-middleware";
import { mintNativeAuthCode } from "@/lib/native-auth-bridge";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" } as const;

const SESSION_COOKIE = "__Secure-neon-auth.session_token";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? await validateBearerToken(token) : null;
  if (!token || !session) {
    return NextResponse.json(
      { error: "no_session" },
      { status: 401, headers: NO_STORE },
    );
  }

  const code = await mintNativeAuthCode({
    sessionToken: token,
    userId: session.userId,
  });

  return NextResponse.json({ code }, { status: 200, headers: NO_STORE });
}
