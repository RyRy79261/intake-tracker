import "server-only";

/**
 * Resolve the Anthropic client a deep-insight job must be polled with.
 *
 * An Anthropic batch belongs to the org of the key that created it. The
 * normal resolver picks the caller's key as of *now*, so a user who saves
 * their own key (or loses a share) while a job is pending gets a key from a
 * different org: retrieve 404s, the job never finalises, and the
 * one-pending-job index blocks new deep runs for 24h.
 *
 * The deep route therefore records which key submitted the batch (see
 * insight-job-payload.ts), and polling resolves exactly that key. If it is
 * gone — the share was revoked, the user dropped off the env-key whitelist,
 * the owner deleted their key — the job cannot be collected, and the caller
 * gets PinnedKeyUnavailableError so it can fail the job and release the lock.
 */

import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { db } from "@intake/db/client";
import { userApiKeys, userKeyShares } from "@intake/db/schema";
import { decryptKey } from "@/lib/key-vault";
import type { ResolvedKey } from "@/lib/ai-key-resolver";
import { getClaudeClientForUser } from "@/lib/server/claude-client";
import {
  PinnedKeyUnavailableError,
  readJobKey,
  type InsightJobKeyRef,
} from "@/lib/server/insight-job-payload";

function isWhitelisted(email: string | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

async function storedAnthropicKey(ownerId: string): Promise<string | null> {
  const rows = await db
    .select({ encrypted: userApiKeys.anthropicKeyEncrypted })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, ownerId))
    .limit(1);
  const encrypted = rows[0]?.encrypted;
  if (!encrypted) return null;
  return decryptKey(encrypted, { userId: ownerId, provider: "anthropic" });
}

/** Resolve exactly the key described by `ref`, or throw PinnedKeyUnavailableError. */
export async function resolvePinnedAnthropicKey(
  userId: string,
  email: string | undefined,
  ref: InsightJobKeyRef,
): Promise<ResolvedKey> {
  const unavailable = new PinnedKeyUnavailableError(ref.keySource);

  if (ref.keySource === "own_stored") {
    if (ref.keyOwnerId !== userId) throw unavailable;
    const apiKey = await storedAnthropicKey(userId);
    if (!apiKey) throw unavailable;
    return { apiKey, source: "own_stored", keyOwnerId: userId };
  }

  if (ref.keySource === "shared_from") {
    const grantorId = ref.keyOwnerId;
    if (!grantorId) throw unavailable;
    // The share must still stand — a revoked share is the grantor saying
    // "stop using my key", and that includes collecting results.
    const shares = await db
      .select({ grantorId: userKeyShares.grantorId })
      .from(userKeyShares)
      .where(
        and(
          eq(userKeyShares.granteeId, userId),
          eq(userKeyShares.grantorId, grantorId),
          eq(userKeyShares.provider, "anthropic"),
        ),
      )
      .limit(1);
    if (shares.length === 0) throw unavailable;
    const apiKey = await storedAnthropicKey(grantorId);
    if (!apiKey) throw unavailable;
    return { apiKey, source: "shared_from", keyOwnerId: grantorId };
  }

  const envKey = process.env.ANTHROPIC_API_KEY;
  if (!envKey || !isWhitelisted(email)) throw unavailable;
  return { apiKey: envKey, source: "env_var", keyOwnerId: null };
}

/**
 * The client to poll a job with. Jobs created before the key was pinned fall
 * back to the caller's current key — the old behaviour, and the best guess
 * available for them.
 */
export async function getClaudeClientForJob(
  requestPayload: unknown,
  userId: string,
  email: string | undefined,
): Promise<{ client: Anthropic; resolved: ResolvedKey }> {
  const ref = readJobKey(requestPayload);
  if (!ref) return getClaudeClientForUser(userId, email);
  const resolved = await resolvePinnedAnthropicKey(userId, email, ref);
  return { client: new Anthropic({ apiKey: resolved.apiKey }), resolved };
}
