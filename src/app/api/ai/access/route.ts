import { NextRequest, NextResponse } from "next/server";
import { verifyAndCheckWhitelist } from "@/lib/privy-server";
import { verificationToAccessResponse } from "@/lib/auth-response";

/**
 * Reports whether the current user is approved for AI / push features.
 *
 * Unlike the withAuth middleware (which returns an error status on any
 * failure), this route returns 200 with a structured body so the client
 * can distinguish "signed in but not whitelisted" from "not signed in /
 * bad token". Response shape: { signedIn, approved, email?, reason? }.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ signedIn: false, approved: false });
  }

  const result = await verifyAndCheckWhitelist(token);
  return NextResponse.json(verificationToAccessResponse(result));
}
