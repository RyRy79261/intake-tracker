import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { purgeExpired } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

/**
 * Scheduled clean-up of expired MCP OAuth codes, revoked tokens and tokens
 * whose refresh has expired (mcp-server-auth#13). Scheduled daily in
 * vercel.json; the token endpoint still purges opportunistically in between.
 *
 * Not behind withAuth: the scheduler authenticates with
 * `Authorization: Bearer <CRON_SECRET>`, which Vercel Cron sends itself (with
 * GET; other schedulers may POST). The purge only deletes rows that can never
 * be used again, so it is idempotent and safe to run late or twice.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await purgeExpired();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mcp/purge] Error:", error);
    return NextResponse.json({ error: "Failed to purge" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
