import { NextRequest, NextResponse } from "next/server";
import { verifyAndCheckWhitelist } from "@/lib/privy-server";

/**
 * Reports whether the current user is approved for AI / push features.
 *
 * Unlike the withAuth middleware (which 401s on any failure), this route
 * returns 200 with a structured body so the client can distinguish
 * "signed in but not whitelisted" from "not signed in / bad token".
 *
 * Response shape:
 *   { signedIn: boolean, approved: boolean, email?, reason? }
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ signedIn: false, approved: false });
  }

  const result = await verifyAndCheckWhitelist(token);

  if (result.success) {
    return NextResponse.json({
      signedIn: true,
      approved: true,
      ...(result.email && { email: result.email }),
    });
  }

  // Distinguish whitelist denial (valid token, blocked) from token failure.
  // The error string is the only signal verifyAndCheckWhitelist exposes.
  const isWhitelistDenial = result.error?.includes("not authorized");
  return NextResponse.json({
    signedIn: !!isWhitelistDenial,
    approved: false,
    ...(result.error && { reason: result.error }),
  });
}
