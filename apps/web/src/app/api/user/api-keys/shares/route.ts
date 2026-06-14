import { NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { withAuth } from "@/lib/auth-middleware";
import { db } from "@intake/db/client";
import { userApiKeys, userKeyShares } from "@intake/db/schema";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";

/**
 * GET    /api/user/api-keys/shares
 *   → {
 *       granted: [{ granteeEmail, provider, createdAt }],  // I shared with these
 *       received: [{ grantorEmail, provider, createdAt }], // shared with me
 *     }
 *
 * POST   /api/user/api-keys/shares
 *   body: { granteeEmail: string, provider: "anthropic" | "groq" }
 *   → 200 on success, 404 if grantee email doesn't have an account yet,
 *     400 if I don't have the corresponding key configured.
 *
 * DELETE /api/user/api-keys/shares?granteeId=...&provider=...
 *   → revokes a grant I made.
 */

const PostSchema = z.object({
  granteeEmail: z.email().max(320),
  provider: z.enum(["anthropic", "groq"]),
});

interface UserByEmailRow {
  id: string;
  email: string;
}

function rawSql() {
  return neon(process.env.DATABASE_URL!);
}

async function findUserByEmail(email: string): Promise<UserByEmailRow | null> {
  const sql = rawSql();
  const rows = (await sql`
    SELECT id, email FROM neon_auth.users_sync
    WHERE LOWER(email) = LOWER(${email})
    LIMIT 1
  `) as UserByEmailRow[];
  return rows[0] ?? null;
}

async function getEmailById(id: string): Promise<string | null> {
  const sql = rawSql();
  const rows = (await sql`
    SELECT email FROM neon_auth.users_sync WHERE id = ${id} LIMIT 1
  `) as { email: string | null }[];
  return rows[0]?.email ?? null;
}

export const GET = withAuth(async ({ auth }) => {
  const userId = auth.userId!;

  const sharesGranted = await db
    .select({
      granteeId: userKeyShares.granteeId,
      granteeEmail: userKeyShares.granteeEmail,
      provider: userKeyShares.provider,
      createdAt: userKeyShares.createdAt,
    })
    .from(userKeyShares)
    .where(eq(userKeyShares.grantorId, userId))
    .orderBy(asc(userKeyShares.createdAt));

  const sharesReceived = await db
    .select({
      grantorId: userKeyShares.grantorId,
      provider: userKeyShares.provider,
      createdAt: userKeyShares.createdAt,
    })
    .from(userKeyShares)
    .where(eq(userKeyShares.granteeId, userId))
    .orderBy(desc(userKeyShares.createdAt));

  // Resolve grantor emails so the UI can show "shared by alice@..." without
  // exposing internal user ids. One round-trip per unique grantor; in
  // practice this list is short.
  const uniqueGrantorIds = Array.from(new Set(sharesReceived.map((s) => s.grantorId)));
  const grantorEmails: Record<string, string | null> = {};
  for (const gid of uniqueGrantorIds) {
    grantorEmails[gid] = await getEmailById(gid);
  }

  return NextResponse.json({
    granted: sharesGranted.map((s) => ({
      granteeId: s.granteeId,
      granteeEmail: s.granteeEmail,
      provider: s.provider,
      createdAt: s.createdAt,
    })),
    received: sharesReceived.map((s) => ({
      grantorEmail: grantorEmails[s.grantorId] ?? "(unknown)",
      provider: s.provider,
      createdAt: s.createdAt,
    })),
  });
});

export const POST = withAuth(async ({ request, auth }) => {
  const json = await parseJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = PostSchema.safeParse(json.body);
  if (!parsed.success) {
    return zodErrorResponse("share POST", parsed.error);
  }

  const { granteeEmail, provider } = parsed.data;
  const userId = auth.userId!;

  // I must have a stored key for the requested provider to share.
  const ownRows = await db
    .select()
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId))
    .limit(1);
  const own = ownRows[0];
  const ownHasKey =
    provider === "anthropic" ? !!own?.anthropicKeyEncrypted : !!own?.groqKeyEncrypted;
  if (!ownHasKey) {
    return NextResponse.json(
      {
        error: `You don't have a stored ${provider} key to share. Add one first.`,
        code: "NO_OWN_KEY",
      },
      { status: 400 },
    );
  }

  const grantee = await findUserByEmail(granteeEmail);
  if (!grantee) {
    return NextResponse.json(
      {
        error: "No account exists for that email. The grantee must sign in once first.",
        code: "GRANTEE_NOT_FOUND",
      },
      { status: 404 },
    );
  }

  if (grantee.id === userId) {
    return NextResponse.json(
      { error: "You can't share a key with yourself" },
      { status: 400 },
    );
  }

  await db
    .insert(userKeyShares)
    .values({
      grantorId: userId,
      granteeId: grantee.id,
      provider,
      granteeEmail: grantee.email.toLowerCase(),
    })
    .onConflictDoNothing();

  console.log(
    `[AUDIT] share grant: grantor=${userId}, grantee=${grantee.id}, provider=${provider}`,
  );
  return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(async ({ request, auth }) => {
  const url = new URL(request.url);
  const granteeId = url.searchParams.get("granteeId");
  const provider = url.searchParams.get("provider");

  if (!granteeId) {
    return NextResponse.json(
      { error: "granteeId query param is required" },
      { status: 400 },
    );
  }
  if (provider !== "anthropic" && provider !== "groq") {
    return NextResponse.json(
      { error: "provider query param must be 'anthropic' or 'groq'" },
      { status: 400 },
    );
  }

  // A user can revoke either direction: as the grantor (taking access away)
  // or as the grantee (declining a share they no longer want).
  await db
    .delete(userKeyShares)
    .where(
      and(
        eq(userKeyShares.provider, provider),
        or(
          and(
            eq(userKeyShares.grantorId, auth.userId!),
            eq(userKeyShares.granteeId, granteeId),
          ),
          and(
            eq(userKeyShares.granteeId, auth.userId!),
            eq(userKeyShares.grantorId, granteeId),
          ),
        ),
      ),
    );

  console.log(
    `[AUDIT] share revoke: actor=${auth.userId}, other=${granteeId}, provider=${provider}`,
  );
  return NextResponse.json({ ok: true });
});
