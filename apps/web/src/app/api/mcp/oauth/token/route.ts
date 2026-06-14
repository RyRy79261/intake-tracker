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
  rotateRefreshToken,
  verifyClientCredentials,
} from "@/lib/mcp/oauth";
import { corsPreflight, withCors } from "@/lib/mcp/cors";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

const codeGrantSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1),
  redirect_uri: z.string().url(),
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

// RFC 6749 §5.1: token endpoint responses MUST NOT be cached. Set on every
// response — error and success — so a misbehaving proxy can't replay a
// previous token to a different caller.
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const;

function applyNoStore(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(NO_STORE_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

function err(error: string, description?: string, status = 400) {
  return withCors(
    applyNoStore(
      NextResponse.json(
        { error, ...(description ? { error_description: description } : {}) },
        { status },
      ),
    ),
  );
}

async function readBody(
  request: NextRequest,
): Promise<Record<string, string> | { __error: string }> {
  const ct = request.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const text = await request.text();
      if (!text.trim()) return {};
      const json = JSON.parse(text) as unknown;
      const out: Record<string, string> = {};
      if (json && typeof json === "object" && !Array.isArray(json)) {
        for (const [k, v] of Object.entries(json)) {
          if (typeof v === "string") out[k] = v;
        }
      }
      return out;
    }
    const form = await request.formData();
    const out: Record<string, string> = {};
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch (err) {
    return {
      __error: err instanceof Error ? err.message : "could not parse body",
    };
  }
}

function readClientCredsFromHeader(
  request: NextRequest,
): { clientId: string; clientSecret: string } | null {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return {
      clientId: decodeURIComponent(decoded.slice(0, idx)),
      clientSecret: decodeURIComponent(decoded.slice(idx + 1)),
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
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
