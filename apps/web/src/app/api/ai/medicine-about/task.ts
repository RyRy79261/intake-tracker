import "server-only";
import { z } from "zod";
import { sanitizeForAI } from "@/lib/security";
import { reply, zodOutput, type AiTaskSpec } from "@/app/api/ai/_shared/ai-task";
// The client's contract for this route: the response must match it.
import type { AiRoutes } from "@/lib/ai-client";
import { SYSTEM_PROMPT, MEDICINE_ABOUT_TOOL } from "@intake/ai-prompts/medicine-about";

/**
 * "About this medicine": what each compound is for, how it works, side
 * effects, warnings. Sends only the generic name (and a combination's
 * compound names). Premium tier, no search.
 */

const RequestSchema = z.object({
  genericName: z.string().trim().min(1, "Medicine name is required").max(200, "Name too long"),
  /** Active ingredient names of a combination tablet (names only). */
  compounds: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
});

const text = z.string().default("");
const textList = z.array(z.string()).default([]);

const ResponseSchema = z.object({
  drugClass: text,
  compounds: z
    .array(
      z.object({
        name: z.string(),
        drugClass: text,
        forText: text,
        howItWorks: text,
        sideEffects: textList,
      }),
    )
    .default([]),
  warnings: z.array(z.object({ risk: z.string(), whatToDo: text })).default([]),
  contraindications: textList,
  foodInstruction: z.enum(["before", "after", "none"]).default("none"),
  foodNote: text,
  pillDescription: text,
  visualIdentification: text,
});

export const medicineAboutTask = {
  route: "/api/ai/medicine-about",
  rateLimit: 5,
  request: RequestSchema,
  tier: "premium",
  // Room for adaptive thinking AND the tool call: thinking can't be turned
  // off on the premium model and its tokens share this ceiling.
  maxTokens: 8192,
  tool: MEDICINE_ABOUT_TOOL,
  retryInstruction: "Now return the information via the medicine_about_result tool.",
  search: { mode: "off" },
  prompt: ({ genericName, compounds }) => {
    const parts = (compounds ?? []).map((c) => sanitizeForAI(c));
    return {
      system: SYSTEM_PROMPT,
      user:
        `Medicine: ${sanitizeForAI(genericName)}` +
        (parts.length > 1 ? `\nActive ingredients: ${parts.join(", ")}` : ""),
    };
  },
  output: zodOutput(ResponseSchema),
  // Nothing usable: say so rather than store an empty page.
  respond: (out) =>
    out.compounds.length === 0 && !out.drugClass
      ? reply(404, { error: "No information was found for this medicine.", code: "NOT_FOUND" })
      : out,
  messages: { failed: "Failed to look up the medicine" },
} satisfies AiTaskSpec<z.infer<typeof RequestSchema>, z.infer<typeof ResponseSchema>, AiRoutes["/api/ai/medicine-about"]["result"]>;
