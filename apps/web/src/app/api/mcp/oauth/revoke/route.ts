/**
 * POST /api/mcp/oauth/revoke — RFC 7009 token revocation.
 *
 * A client (claude.ai, on "disconnect") presents an access or refresh token
 * and its client credentials. Either token revokes the pair. Per RFC 7009
 * §2.2 the answer is 200 whether or not the token was known, so the endpoint
 * can't be used to probe for valid tokens. The user-facing equivalent, for
 * disconnecting from inside the app, is /api/mcp/connections.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { revokeToken, verifyClientCredentials } from "@/lib/mcp/oauth";
import { corsPreflight, withCors } from "@/lib/mcp/cors";
import {
  applyNoStore,
  oauthError,
  readBody,
  readClientCredsFromHeader,
} from "@/lib/mcp/oauth-request";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

const revokeSchema = z.object({
  token: z.string().min(1),
  token_type_hint: z.string().optional(),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if ("__error" in body) return oauthError("invalid_request", body.__error);

  const basic = readClientCredsFromHeader(request);
  if (basic) {
    body.client_id ??= basic.clientId;
    body.client_secret ??= basic.clientSecret;
  }

  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) return oauthError("invalid_request", parsed.error.message);

  const cred = await verifyClientCredentials(
    parsed.data.client_id,
    parsed.data.client_secret,
  );
  if (!cred.valid) {
    return oauthError("invalid_client", "client authentication failed", 401);
  }

  // The hint is optional and only an optimisation (§2.1); both token kinds
  // live on the same row, so one lookup covers either.
  await revokeToken(parsed.data.token, parsed.data.client_id);
  return withCors(applyNoStore(new NextResponse(null, { status: 200 })));
}
