import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth-middleware";
import { db } from "@intake/db/client";
import { userApiKeys } from "@intake/db/schema";
import { encryptKey, lastFourOf, type KeyVaultAad } from "@/lib/key-vault";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";

/**
 * GET  /api/user/api-keys
 *   → { anthropic: { configured, last4 } | null, groq: { configured, last4 } | null }
 *
 * PUT  /api/user/api-keys
 *   body: { provider: "anthropic" | "groq", key: string }
 *   → { configured: true, last4 }
 *
 * DELETE /api/user/api-keys?provider=anthropic
 *   → { configured: false }
 *
 * The raw key is never returned. `last4` is the only plaintext fragment we
 * persist or expose; everything else is encrypted via key-vault.ts.
 */

const PutSchema = z.object({
  provider: z.enum(["anthropic", "groq"]),
  key: z.string().min(8).max(500),
});

function validateKeyFormat(provider: "anthropic" | "groq", key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return "Key is empty";
  if (provider === "anthropic" && !trimmed.startsWith("sk-ant-")) {
    return "Anthropic keys must start with 'sk-ant-'";
  }
  if (provider === "groq" && !trimmed.startsWith("gsk_")) {
    return "Groq keys must start with 'gsk_'";
  }
  return null;
}

export const GET = withAuth(async ({ auth }) => {
  const rows = await db
    .select()
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, auth.userId!))
    .limit(1);
  const row = rows[0];
  return NextResponse.json({
    anthropic: row?.anthropicKeyEncrypted
      ? { configured: true, last4: row.anthropicLast4 ?? "" }
      : null,
    groq: row?.groqKeyEncrypted
      ? { configured: true, last4: row.groqLast4 ?? "" }
      : null,
  });
});

export const PUT = withAuth(async ({ request, auth }) => {
  const json = await parseJsonBody(request);
  if (!json.ok) return json.response;

  const parsed = PutSchema.safeParse(json.body);
  if (!parsed.success) {
    return zodErrorResponse("api-keys PUT", parsed.error);
  }

  const { provider, key } = parsed.data;
  const trimmed = key.trim();
  const formatError = validateKeyFormat(provider, trimmed);
  if (formatError) {
    return NextResponse.json({ error: formatError }, { status: 400 });
  }

  const aad: KeyVaultAad = { userId: auth.userId!, provider };
  let encrypted: string;
  try {
    encrypted = encryptKey(trimmed, aad);
  } catch (e) {
    console.error("[api-keys] encryption failed:", e);
    return NextResponse.json(
      { error: "Server encryption is not configured" },
      { status: 503 },
    );
  }

  const last4 = lastFourOf(trimmed);
  const now = new Date();

  if (provider === "anthropic") {
    await db
      .insert(userApiKeys)
      .values({
        userId: auth.userId!,
        anthropicKeyEncrypted: encrypted,
        anthropicLast4: last4,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userApiKeys.userId,
        set: {
          anthropicKeyEncrypted: encrypted,
          anthropicLast4: last4,
          updatedAt: now,
        },
      });
  } else {
    await db
      .insert(userApiKeys)
      .values({
        userId: auth.userId!,
        groqKeyEncrypted: encrypted,
        groqLast4: last4,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userApiKeys.userId,
        set: {
          groqKeyEncrypted: encrypted,
          groqLast4: last4,
          updatedAt: now,
        },
      });
  }

  console.log(`[AUDIT] api-key set: user=${auth.userId}, provider=${provider}`);

  return NextResponse.json({ configured: true, last4 });
});

export const DELETE = withAuth(async ({ request, auth }) => {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  if (provider !== "anthropic" && provider !== "groq") {
    return NextResponse.json(
      { error: "provider query param must be 'anthropic' or 'groq'" },
      { status: 400 },
    );
  }

  const now = new Date();
  if (provider === "anthropic") {
    await db
      .update(userApiKeys)
      .set({
        anthropicKeyEncrypted: sql`NULL`,
        anthropicLast4: sql`NULL`,
        updatedAt: now,
      })
      .where(eq(userApiKeys.userId, auth.userId!));
  } else {
    await db
      .update(userApiKeys)
      .set({
        groqKeyEncrypted: sql`NULL`,
        groqLast4: sql`NULL`,
        updatedAt: now,
      })
      .where(eq(userApiKeys.userId, auth.userId!));
  }

  console.log(`[AUDIT] api-key clear: user=${auth.userId}, provider=${provider}`);
  return NextResponse.json({ configured: false });
});
