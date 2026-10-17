import "server-only";
import { z } from "zod";
import { sanitizeForAI } from "@/lib/security";
import { zodOutput, type AiTaskSpec } from "@/app/api/ai/_shared/ai-task";
// The client's contract for this route: the response must match it.
import type { AiRoutes } from "@/lib/ai-client";
import { SYSTEM_PROMPT, MEDICINE_SEARCH_TOOL } from "@intake/ai-prompts/medicine-search";

/**
 * Medicine lookup for the prescription wizard. Premium tier with web_search
 * allowed: it grounds brand names and pill appearance, which the model
 * would otherwise recall.
 */

const MedicineSearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required").max(200, "Query too long"),
  country: z.string().max(100).optional(),
});

const CompoundStrengthSchema = z.object({
  name: z.string(),
  strength: z.number(),
});

const StrengthOptionSchema = z.object({
  label: z.string(),
  compounds: z.array(CompoundStrengthSchema).default([]),
});

const MedicineSearchResponseSchema = z.object({
  brandNames: z.array(z.string()).default([]),
  localAlternatives: z.array(z.string()).default([]),
  genericName: z.string().default(""),
  dosageStrengths: z.array(z.string()).default([]),
  activeIngredients: z.array(z.string()).default([]),
  strengthOptions: z.array(StrengthOptionSchema).default([]),
  commonIndications: z.array(z.string()).default([]),
  foodInstruction: z.enum(["before", "after", "none"]).default("none"),
  foodNote: z.string().optional(),
  pillColor: z.string().default(""),
  pillShape: z.string().default(""),
  pillDescription: z.string().default(""),
  drugClass: z.string().default(""),
  visualIdentification: z.string().optional(),
  contraindications: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  isGenericFallback: z.boolean().default(false),
});

export const medicineSearchTask = {
  route: "/api/ai/medicine-search",
  rateLimit: 15,
  request: MedicineSearchRequestSchema,
  tier: "premium",
  // Room for adaptive thinking, the search traffic AND the tool call:
  // thinking can't be turned off on the premium model and its tokens share
  // this ceiling.
  maxTokens: 8192,
  tool: MEDICINE_SEARCH_TOOL,
  retryInstruction: "Now return the result via the medicine_search_result tool.",
  search: { mode: "allowed" },
  prompt: ({ query, country }) => {
    const sanitized = sanitizeForAI(query.trim());
    const sanitizedCountry = country ? sanitizeForAI(country.trim()) : "";
    return {
      system: SYSTEM_PROMPT,
      user: sanitizedCountry
        ? `Look up this medication and provide detailed pharmaceutical information, focusing specifically on brands and availability in ${sanitizedCountry}: "${sanitized}"`
        : `Look up this medication and provide detailed pharmaceutical information: "${sanitized}"`,
    };
  },
  output: zodOutput(MedicineSearchResponseSchema),
  // The wizard pre-fills colour, shape and markings from these fields. If no
  // web search actually returned results, they came from model memory (often
  // the reference product, not the local generic), so drop them rather than
  // autofill a guess. The free-text description stays for the result card.
  respond: (out, { searched }) => {
    const { visualIdentification, ...rest } = out;
    return {
      ...rest,
      ...(searched ? { visualIdentification } : { pillColor: "", pillShape: "" }),
      appearanceVerified: searched,
    };
  },
  messages: { failed: "Failed to process request" },
} satisfies AiTaskSpec<
  z.infer<typeof MedicineSearchRequestSchema>,
  z.infer<typeof MedicineSearchResponseSchema>,
  AiRoutes["/api/ai/medicine-search"]["result"]
>;
