import { NextResponse } from "next/server";
import { and, eq, gte, sql as drizzleSql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { withAuth } from "@/lib/auth-middleware";
import { db } from "@intake/db/client";
import { aiUsage } from "@intake/db/schema";

/**
 * GET /api/user/ai-usage
 *   → {
 *       mine: {
 *         anthropic: { totalCalls, inputTokens, outputTokens },
 *         groq: { totalCalls, audioSeconds },
 *         byRoute: [{ route, calls, inputTokens, outputTokens }],
 *       },
 *       asGrantor: {
 *         byGrantee: [{ granteeEmail, provider, calls, inputTokens, outputTokens }],
 *       },
 *     }
 *
 * Mine: usage I incurred (regardless of whose key was used).
 * AsGrantor: usage others incurred against my stored key.
 *
 * `?days=30` controls the window (default 30, max 365).
 */
export const GET = withAuth(async ({ request, auth }) => {
  const userId = auth.userId!;
  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get("days") ?? "30");
  const days = Math.max(1, Math.min(365, Number.isFinite(daysParam) ? daysParam : 30));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // --- Mine, totals by provider ---
  const mineByProvider = await db
    .select({
      provider: aiUsage.provider,
      calls: drizzleSql<number>`count(*)::int`,
      inputTokens: drizzleSql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: drizzleSql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
      cacheReadTokens: drizzleSql<number>`coalesce(sum(${aiUsage.cacheReadTokens}), 0)::int`,
      cacheCreateTokens: drizzleSql<number>`coalesce(sum(${aiUsage.cacheCreateTokens}), 0)::int`,
      audioSeconds: drizzleSql<number>`coalesce(sum(${aiUsage.audioSeconds}), 0)::int`,
    })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.status, "success"),
        gte(aiUsage.timestamp, cutoff),
      ),
    )
    .groupBy(aiUsage.provider);

  // --- Mine, by route ---
  const mineByRoute = await db
    .select({
      route: aiUsage.route,
      provider: aiUsage.provider,
      calls: drizzleSql<number>`count(*)::int`,
      inputTokens: drizzleSql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: drizzleSql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
    })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.status, "success"),
        gte(aiUsage.timestamp, cutoff),
      ),
    )
    .groupBy(aiUsage.route, aiUsage.provider);

  // --- As grantor: who consumed my key ---
  // Join with neon_auth.users_sync via raw SQL to get the grantee email.
  const rawSql = neon(process.env.DATABASE_URL!);
  const cutoffIso = cutoff.toISOString();
  const asGrantor = (await rawSql`
    SELECT
      ai.user_id            AS grantee_id,
      u.email               AS grantee_email,
      ai.provider           AS provider,
      COUNT(*)::int         AS calls,
      COALESCE(SUM(ai.input_tokens), 0)::int   AS input_tokens,
      COALESCE(SUM(ai.output_tokens), 0)::int  AS output_tokens,
      COALESCE(SUM(ai.audio_seconds), 0)::int  AS audio_seconds
    FROM ai_usage ai
    LEFT JOIN neon_auth.users_sync u ON u.id = ai.user_id
    WHERE ai.key_owner_id = ${userId}
      AND ai.user_id <> ${userId}
      AND ai.status = 'success'
      AND ai.timestamp >= ${cutoffIso}
    GROUP BY ai.user_id, u.email, ai.provider
    ORDER BY calls DESC
  `) as Array<{
    grantee_id: string;
    grantee_email: string | null;
    provider: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    audio_seconds: number;
  }>;

  return NextResponse.json({
    windowDays: days,
    mine: {
      byProvider: mineByProvider,
      byRoute: mineByRoute,
    },
    asGrantor: {
      byGrantee: asGrantor.map((r) => ({
        granteeId: r.grantee_id,
        granteeEmail: r.grantee_email ?? "(unknown)",
        provider: r.provider,
        calls: r.calls,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        audioSeconds: r.audio_seconds,
      })),
    },
  });
});
