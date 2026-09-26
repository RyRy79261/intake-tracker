/**
 * POST /api/mcp/oauth/token — RFC 6749 token endpoint.
 *
 * Supported grants:
 *   - authorization_code (with PKCE)
 *   - refresh_token (rotates the refresh token on every use)
 */
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  consumeAuthCode,
  issueAccessToken,
  maybePurgeExpired,
  rotateRefreshToken,
  verifyClientCredentials,
} from "@/lib/mcp/oauth";
import { corsPreflight, withCors } from "@/lib/mcp/cors";
import {
  applyNoStore,
  oauthError as err,
  readBody,
  readClientCredsFromHeader,
} from "@/lib/mcp/oauth-request";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

const codeGrantSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1),
  redirect_uri: z.url(),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  code_verifier: z.string().min(43).max(128),
});

const refreshGrantSchema = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  scope: z.string().optional(),
});

export async function POST(request: NextRequest) {
  // Housekeeping for expired codes and dead tokens; throttled, never awaited.
  maybePurgeExpired();

  const parsedBody = await readBody(request);
  if ("__error" in parsedBody) {
    return err("invalid_request", parsedBody.__error);
  }
  const body = parsedBody;

  // Client may authenticate via Basic header OR body params.
  const basic = readClientCredsFromHeader(request);
  if (basic) {
    body.client_id ??= basic.clientId;
    body.client_secret ??= basic.clientSecret;
  }

  const grantType = body.grant_type;

  if (grantType === "authorization_code") {
    const parsed = codeGrantSchema.safeParse(body);
    if (!parsed.success)
      return err("invalid_request", parsed.error.message);

    const cred = await verifyClientCredentials(
      parsed.data.client_id,
      parsed.data.client_secret,
    );
    if (!cred.valid)
      return err("invalid_client", "client authentication failed", 401);

    const result = await consumeAuthCode({
      code: parsed.data.code,
      clientId: parsed.data.client_id,
      redirectUri: parsed.data.redirect_uri,
      codeVerifier: parsed.data.code_verifier,
    });
    if (!result.ok) return err("invalid_grant", result.reason);

    const tokens = await issueAccessToken({
      clientId: parsed.data.client_id,
      userId: result.userId,
      scope: result.scope,
    });
    return withCors(
      applyNoStore(
        NextResponse.json({
          access_token: tokens.accessToken,
          token_type: "Bearer",
          expires_in: tokens.accessExpiresIn,
          refresh_token: tokens.refreshToken,
          scope: result.scope,
        }),
      ),
    );
  }

  if (grantType === "refresh_token") {
    const parsed = refreshGrantSchema.safeParse(body);
    if (!parsed.success)
      return err("invalid_request", parsed.error.message);

    const cred = await verifyClientCredentials(
      parsed.data.client_id,
      parsed.data.client_secret,
    );
    if (!cred.valid)
      return err("invalid_client", "client authentication failed", 401);

    const rotated = await rotateRefreshToken(
      parsed.data.refresh_token,
      parsed.data.client_id,
    );
    if (!rotated.ok) return err("invalid_grant", rotated.reason);

    return withCors(
      applyNoStore(
        NextResponse.json({
          access_token: rotated.tokens.accessToken,
          token_type: "Bearer",
          expires_in: rotated.tokens.accessExpiresIn,
          refresh_token: rotated.tokens.refreshToken,
          scope: rotated.scope,
        }),
      ),
    );
  }

  return err("unsupported_grant_type", `grant_type='${String(grantType)}' not supported`);
}
