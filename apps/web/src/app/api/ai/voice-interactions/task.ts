import "server-only";
import { z } from "zod";
import { sanitizeForAI } from "@/lib/security";
import { reply, zodOutput, type AiTaskSpec } from "@/app/api/ai/_shared/ai-task";
// The client's contract for this route: the response must match it.
import type { AiRoutes } from "@/lib/ai-client";
import {
  SYSTEM_PROMPT,
  VOICE_INTERACTIONS_TOOL,
  buildUserMessage,
} from "@intake/ai-prompts/voice-interactions";

/**
 * A spoken "look up the interactions of …": find the substances named in the
 * transcript and correct names that speech-to-text spelled by sound. Each
 * name is then checked by /api/ai/interaction-check on its own, so the
 * report fills in one substance at a time. Quality tier, no search.
 */

/** The most substances one question checks (interaction-check is rate limited). */
export const MAX_SUBSTANCES = 5;

const RequestSchema = z.object({
  transcript: z.string().min(1).max(2000),
  medications: z.array(z.string().min(1).max(100)).max(50).optional(),
});

const ResultSchema = z.object({
  substances: z.array(
    z.object({
      heard: z.string(),
      name: z.string(),
      brand: z.string(),
      unsure: z.boolean(),
    }),
  ),
  note: z.string(),
});

type Request = z.infer<typeof RequestSchema>;

const capitalise = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

export const voiceInteractionsTask = {
  route: "/api/ai/voice-interactions",
  rateLimit: 20,
  request: RequestSchema,
  tier: "quality",
  maxTokens: 4096,
  tool: VOICE_INTERACTIONS_TOOL,
  retryInstruction: "Return the substances via the voice_interactions_result tool now.",
  search: { mode: "off" },
  prompt: ({ transcript, medications }) => {
    const text = sanitizeForAI(transcript, 2000).trim();
    if (!text) return reply(400, { error: "Empty input after sanitization" });
    return {
      system: SYSTEM_PROMPT,
      user: buildUserMessage(
        text,
        (medications ?? []).map((m) => sanitizeForAI(m, 100)).filter((m) => m !== ""),
      ),
    };
  },
  output: zodOutput(ResultSchema),
  respond: ({ substances, note }, { req }) => {
    // One row per name: the model can repeat a substance said twice.
    const seen = new Set<string>();
    const named = substances
      .map((s) => ({ ...s, name: capitalise(s.name.trim()), heard: s.heard.trim(), brand: s.brand.trim() }))
      .filter((s) => {
        const key = s.name.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    // "Can I mix alcohol with my bisoprolol?" checks alcohol against the
    // user's medicines, bisoprolol included. Their own medicine is the thing
    // to check only when nothing else was named.
    const own = new Set((req.medications ?? []).map((m) => m.trim().toLowerCase()));
    const others = named.filter((s) => !own.has(s.name.toLowerCase()));
    const unique = others.length > 0 ? others : named;
    return {
      substances: unique.slice(0, MAX_SUBSTANCES).map(({ brand, ...s }) => ({
        ...s,
        ...(brand !== "" && { brand }),
      })),
      ...(unique.length > MAX_SUBSTANCES && { overCap: unique.length - MAX_SUBSTANCES }),
      ...(note.trim() !== "" && { note: note.trim() }),
    };
  },
  messages: { failed: "Failed to read the question" },
} satisfies AiTaskSpec<Request, z.infer<typeof ResultSchema>, AiRoutes["/api/ai/voice-interactions"]["result"]>;
