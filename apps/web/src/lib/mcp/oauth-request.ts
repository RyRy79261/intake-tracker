/**
 * Request/response plumbing shared by the OAuth endpoints that clients call
 * directly (token, revoke): body parsing, client credentials, and the
 * RFC 6749 §5.1 no-store error envelope.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withCors } from "@/lib/mcp/cors";

// RFC 6749 §5.1: token endpoint responses MUST NOT be cached. Set on every
// response — error and success — so a misbehaving proxy can't replay a
// previous token to a different caller.
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const;

export function applyNoStore(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(NO_STORE_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

export function oauthError(error: string, description?: string, status = 400) {
  return withCors(
    applyNoStore(
      NextResponse.json(
        { error, ...(description ? { error_description: description } : {}) },
        { status },
      ),
    ),
  );
}

/** Reads a form-encoded or JSON body into string fields. */
export async function readBody(
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

export function readClientCredsFromHeader(
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
