import "server-only";
import { z } from "zod";
import { sanitizeForAI } from "@/lib/security";
import { zodOutput, type AiTaskSpec } from "@/app/api/ai/_shared/ai-task";
import {
  SYSTEM_PROMPT,
  INTERACTION_CHECK_TOOL,
  withUnassessedMedications,
} from "@intake/ai-prompts/interaction-check";

/**
 * Interaction check: a new medication (`conflict`) or any substance
 * (`lookup`) against the active prescriptions. Premium tier, no search.
 */

const ActivePrescriptionSchema = z.object({
  genericName: z.string(),
  drugClass: z.string().optional(),
});

const ConflictRequestSchema = z.object({
  mode: z.literal("conflict"),
  newMedication: z.string(),
  activePrescriptions: z.array(ActivePrescriptionSchema).min(1),
});

const LookupRequestSchema = z.object({
  mode: z.literal("lookup"),
  substance: z.string(),
  activePrescriptions: z.array(ActivePrescriptionSchema).min(1),
});

const RequestSchema = z.discriminatedUnion("mode", [
  ConflictRequestSchema,
  LookupRequestSchema,
]);

const InteractionResultSchema = z.object({
  interactions: z.array(
    z.object({
      substance: z.string(),
      medication: z.string(),
      severity: z.enum(["AVOID", "CAUTION", "OK"]),
      description: z.string(),
    }),
  ),
  drugClass: z.string().optional(),
  summary: z.string().optional(),
});

type Request = z.infer<typeof RequestSchema>;

const querySubstance = (req: Request) =>
  req.mode === "conflict" ? req.newMedication : req.substance;

export const interactionCheckTask = {
  route: "/api/ai/interaction-check",
  rateLimit: 5,
  request: RequestSchema,
  tier: "premium",
  // Room for adaptive thinking AND the tool call: thinking can't be turned
  // off on the premium model and its tokens share this ceiling.
  maxTokens: 8192,
  tool: INTERACTION_CHECK_TOOL,
  retryInstruction: "Now return the analysis via the interaction_check_result tool.",
  search: { mode: "off" },
  prompt: (req) => {
    const rxList = req.activePrescriptions
      .map(
        (rx) =>
          `- ${sanitizeForAI(rx.genericName)}${rx.drugClass ? ` (${sanitizeForAI(rx.drugClass)})` : ""}`,
      )
      .join("\n");
    return {
      system: SYSTEM_PROMPT,
      user: `Currently taking:\n${rxList}\n\nCheck interactions for: ${sanitizeForAI(querySubstance(req))}`,
    };
  },
  output: zodOutput(InteractionResultSchema),
  // An omitted medication would read as "no interaction"; flag it instead.
  respond: (out, { req }) => ({
    ...out,
    interactions: withUnassessedMedications(
      out.interactions,
      req.activePrescriptions.map((rx) => rx.genericName),
      querySubstance(req),
    ),
  }),
  messages: { failed: "Failed to check interactions" },
} satisfies AiTaskSpec<Request, z.infer<typeof InteractionResultSchema>, unknown>;
