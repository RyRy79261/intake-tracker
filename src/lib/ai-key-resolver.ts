/**
 * Resolve which API key to use for an AI request.
 *
 * Priority, per provider:
 *   1. The caller's own stored key (user_api_keys row).
 *   2. A key shared with the caller by another user (user_key_shares row
 *      pointing at a grantor whose user_api_keys row has the provider set).
 *   3. The server env-var key, but only if the caller's email is on the
 *      ALLOWED_EMAILS whitelist (interim shim — lets the owner keep using
 *      the existing env-var setup without re-entering anything).
 *
 * Returns a structured result so callers can pass `keyOwnerId` + `keySource`
 * into usage tracking without re-deriving them.
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/lib/drizzle";
import { userApiKeys, userKeyShares } from "@/db/schema";
import { decryptKey } from "@/lib/key-vault";

export type AiProvider = "anthropic" | "groq";
export type KeySource = "own_stored" | "shared_from" | "env_var";

export interface ResolvedKey {
  apiKey: string;
  source: KeySource;
  /** userId whose stored key was used (null for env-var). */
  keyOwnerId: string | null;
}

export class NoAiKeyError extends Error {
  constructor(public provider: AiProvider) {
    super(`No ${provider} API key configured for user`);
    this.name = "NoAiKeyError";
  }
}

function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function envKeyFor(provider: AiProvider): string | undefined {
  return provider === "anthropic"
    ? process.env.ANTHROPIC_API_KEY
    : process.env.GROQ_API_KEY;
}

function encryptedColumn(provider: AiProvider) {
  return provider === "anthropic"
    ? userApiKeys.anthropicKeyEncrypted
    : userApiKeys.groqKeyEncrypted;
}

function decryptStored(
  encrypted: string,
  ownerId: string,
  provider: AiProvider,
): string {
  return decryptKey(encrypted, { userId: ownerId, provider });
}

export async function resolveAiKey(
  userId: string,
  email: string | undefined,
  provider: AiProvider,
): Promise<ResolvedKey> {
  const ownRows = await db
    .select()
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId))
    .limit(1);

  const own = ownRows[0];
  const ownEncrypted =
    provider === "anthropic" ? own?.anthropicKeyEncrypted : own?.groqKeyEncrypted;

  if (own && ownEncrypted) {
    return {
      apiKey: decryptStored(ownEncrypted, userId, provider),
      source: "own_stored",
      keyOwnerId: userId,
    };
  }

  // Look for a share granted to this user for this provider. If multiple
  // grantors exist, pick the first deterministically (createdAt asc) — in
  // practice a user shouldn't have many concurrent grants.
  const shareRows = await db
    .select({
      grantorId: userKeyShares.grantorId,
    })
    .from(userKeyShares)
    .where(
      and(
        eq(userKeyShares.granteeId, userId),
        eq(userKeyShares.provider, provider),
      ),
    )
    .limit(5);

  for (const { grantorId } of shareRows) {
    const grantorRows = await db
      .select({ encrypted: encryptedColumn(provider) })
      .from(userApiKeys)
      .where(eq(userApiKeys.userId, grantorId))
      .limit(1);
    const encrypted = grantorRows[0]?.encrypted;
    if (encrypted) {
      return {
        apiKey: decryptStored(encrypted, grantorId, provider),
        source: "shared_from",
        keyOwnerId: grantorId,
      };
    }
  }

  // Env-var fallback for whitelisted users (interim).
  const envKey = envKeyFor(provider);
  if (envKey && email) {
    const allowed = getAllowedEmails();
    if (allowed.length > 0 && allowed.includes(email.toLowerCase())) {
      return {
        apiKey: envKey,
        source: "env_var",
        keyOwnerId: null,
      };
    }
  }

  throw new NoAiKeyError(provider);
}
