import "server-only";
import { z } from "zod";
import { sanitizeForAI } from "@/lib/security";
import { zodOutput, type AiTaskSpec } from "@/app/api/ai/_shared/ai-task";
import { TITRATION_WARNINGS_TOOL, SYSTEM_PROMPT } from "@intake/ai-prompts/titration-warnings";

/**
 * Warning signs to watch for during a titration plan, considering the
 * changing and the unchanged medications. Premium tier, no search.
 */

const RequestSchema = z.object({
  prescriptions: z
    .array(
      z.object({
        genericName: z.string(),
        currentDosage: z.string().optional(),
        newDosage: z.string().optional(),
        newSchedule: z.array(z.string()).optional(),
        newTotalDaily: z.string().optional(),
        frequency: z.string().optional(),
      }),
    )
    .min(1),
  otherMedications: z
    .array(
      z.object({
        genericName: z.string(),
      }),
    )
    .optional(),
  title: z.string().max(200).optional(),
});

const ResponseSchema = z.object({
  warnings: z.array(z.string()),
});

export const titrationWarningsTask = {
  route: "/api/ai/titration-warnings",
  // Every call is a premium-model request, often on a shared key: cap a
  // looping or scripted client per user.
  rateLimit: 5,
  request: RequestSchema,
  tier: "premium",
  // Room for adaptive thinking AND the tool call: thinking can't be turned
  // off on the premium model and its tokens share this ceiling.
  maxTokens: 8192,
  tool: TITRATION_WARNINGS_TOOL,
  retryInstruction: "Now return the warnings via the titration_warnings_result tool.",
  search: { mode: "off" },
  prompt: ({ prescriptions, otherMedications, title }) => {
    const rxList = prescriptions
      .map((rx) => {
        const lines = [`- ${sanitizeForAI(rx.genericName)} (CHANGING)`];
        if (rx.currentDosage) lines.push(`    Current: ${sanitizeForAI(rx.currentDosage)}`);
        if (rx.newTotalDaily) lines.push(`    New total: ${sanitizeForAI(rx.newTotalDaily)}, ${sanitizeForAI(rx.frequency ?? "")}`);
        if (rx.newSchedule && rx.newSchedule.length > 0) {
          lines.push(`    New schedule:`);
          for (const s of rx.newSchedule) {
            lines.push(`      - ${sanitizeForAI(s)}`);
          }
        } else if (rx.newDosage) {
          lines.push(`    New: ${sanitizeForAI(rx.newDosage)}`);
        }
        return lines.join("\n");
      })
      .join("\n");

    const otherRxList = otherMedications && otherMedications.length > 0
      ? "\n\nThe patient is also currently taking:\n" + otherMedications
          .map((rx) => `- ${sanitizeForAI(rx.genericName)} (unchanged)`)
          .join("\n")
      : "";

    const ask = `${rxList}${otherRxList}\n\nConsidering all medications, what warning signs should the patient watch for? Pay special attention to interactions between changing and unchanged medications.`;
    return {
      system: SYSTEM_PROMPT,
      user: title
        ? `Titration plan "${sanitizeForAI(title)}" involves these medication changes:\n${ask}`
        : `A dosage titration involves these medication changes:\n${ask}`,
    };
  },
  output: zodOutput(ResponseSchema),
  respond: (out) => out,
  messages: { failed: "Failed to generate warnings" },
} satisfies AiTaskSpec<z.infer<typeof RequestSchema>, z.infer<typeof ResponseSchema>, unknown>;
