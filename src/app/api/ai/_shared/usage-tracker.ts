/**
 * Fire-and-forget AI usage logging into the `ai_usage` table.
 *
 * Every AI route is expected to call `recordUsage` once per upstream provider
 * response (success or error). The promise is intentionally not awaited by
 * the route handler — a logging failure must not affect the user-facing
 * response. Lost rows on crash are acceptable.
 */

import { db } from "@/lib/drizzle";
import { aiUsage } from "@/db/schema";
import type { AiProvider, KeySource } from "@/lib/ai-key-resolver";

export interface UsageRecord {
  userId: string;
  keyOwnerId: string | null;
  keySource: KeySource;
  provider: AiProvider;
  model: string;
  route: string;
  status: "success" | "error";
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  cacheReadTokens?: number | undefined;
  cacheCreateTokens?: number | undefined;
  audioSeconds?: number | undefined;
  durationMs?: number | undefined;
}

export function recordUsage(record: UsageRecord): void {
  // Intentional fire-and-forget. We catch and log so an unhandled rejection
  // doesn't crash the runtime, but the route handler does not await this.
  void db
    .insert(aiUsage)
    .values({
      userId: record.userId,
      keyOwnerId: record.keyOwnerId,
      keySource: record.keySource,
      provider: record.provider,
      model: record.model,
      route: record.route,
      status: record.status,
      inputTokens: record.inputTokens ?? 0,
      outputTokens: record.outputTokens ?? 0,
      cacheReadTokens: record.cacheReadTokens ?? 0,
      cacheCreateTokens: record.cacheCreateTokens ?? 0,
      audioSeconds: record.audioSeconds ?? null,
      durationMs: record.durationMs ?? null,
    })
    .catch((e) => {
      console.error("[ai-usage] failed to record usage:", e);
    });
}

/**
 * Extract token counts from an Anthropic `Message` response. The SDK types
 * cache fields as optional so we coerce to 0 when missing.
 */
export function tokensFromAnthropic(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): Pick<
  UsageRecord,
  "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheCreateTokens"
> {
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreateTokens: usage.cache_creation_input_tokens ?? 0,
  };
}
