/**
 * Schema, prompt construction, and response contract for the analytics
 * insights webhook (`POST /api/analytics/insights`).
 *
 * The request body is an intentionally narrow, fully numeric/enumerated
 * snapshot of computed analytics — no free text or record notes — so personal
 * health detail cannot reach the external AI call by construction. The webhook
 * caller computes the predefined analytics queries (the same ones the app runs
 * locally); this layer turns them into an AI-written narrative.
 */

import { z } from "zod";
import { DOMAINS, type Domain } from "./analytics-types";

const DOMAIN_LABELS: Record<Domain, string> = {
  water: "water intake",
  salt: "sodium intake",
  weight: "weight",
  bp: "blood pressure",
  eating: "eating",
  urination: "urination",
  defecation: "defecation",
  caffeine: "caffeine intake",
  alcohol: "alcohol intake",
  medication: "medication adherence",
};

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const TrendSchema = z.object({
  direction: z.enum(["rising", "falling", "stable"]),
  slope: z.number(),
  confidence: z.number().min(0).max(1),
});

const BpMetricSchema = z.object({
  avgSystolic: z.number(),
  avgDiastolic: z.number(),
  readingCount: z.number().int().nonnegative(),
  systolicTrend: TrendSchema,
  diastolicTrend: TrendSchema,
});

const WeightMetricSchema = z.object({
  avg: z.number(),
  min: z.number(),
  max: z.number(),
  changeKg: z.number(),
  readingCount: z.number().int().nonnegative(),
  trend: TrendSchema,
});

const FluidBalanceMetricSchema = z.object({
  avgBalanceMl: z.number(),
  daysOnTarget: z.number().int().nonnegative(),
  daysTotal: z.number().int().nonnegative(),
});

const IntakeMetricSchema = z.object({
  avgWaterMl: z.number().nonnegative(),
  avgSodiumMg: z.number().nonnegative(),
  waterGoalMl: z.number().positive(),
  sodiumLimitMg: z.number().positive(),
});

const CorrelationMetricSchema = z.object({
  domainA: z.enum(DOMAINS),
  domainB: z.enum(DOMAINS),
  coefficient: z.number().min(-1).max(1),
  strength: z.enum(["strong", "moderate", "weak", "none"]),
  pairedDays: z.number().int().nonnegative(),
});

export const AnalyticsInsightsRequestSchema = z.object({
  range: z
    .object({
      start: z.number(),
      end: z.number(),
    })
    .refine((r) => r.start <= r.end, {
      message: "range.start must be <= range.end",
    }),
  metrics: z
    .object({
      bp: BpMetricSchema.optional(),
      weight: WeightMetricSchema.optional(),
      fluidBalance: FluidBalanceMetricSchema.optional(),
      intake: IntakeMetricSchema.optional(),
      correlations: z.array(CorrelationMetricSchema).max(12).optional(),
    })
    .refine(
      (m) =>
        Boolean(m.bp) ||
        Boolean(m.weight) ||
        Boolean(m.fluidBalance) ||
        Boolean(m.intake) ||
        (m.correlations !== undefined && m.correlations.length > 0),
      { message: "At least one metric group must be provided" },
    ),
});

export type AnalyticsInsightsRequest = z.infer<
  typeof AnalyticsInsightsRequestSchema
>;

// ---------------------------------------------------------------------------
// Response contract
// ---------------------------------------------------------------------------

export const InsightResponseSchema = z.object({
  summary: z.string().min(1).max(2000),
  observations: z.array(z.string().min(1).max(500)).max(12),
});

export const INSIGHT_TOOL = {
  name: "analytics_insight" as const,
  description:
    "Return a plain-language summary and a list of specific observations for the supplied health metrics.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description:
          "A 2-4 sentence plain-language overview of the period, referencing the actual numbers.",
      },
      observations: {
        type: "array",
        items: { type: "string" },
        description:
          "3-6 specific, factual observations. Each cites a concrete metric.",
      },
    },
    required: ["summary", "observations"],
    additionalProperties: false,
  },
};

export const INSIGHTS_SYSTEM_PROMPT = `You summarise personal health-tracking metrics for a self-tracking app.

Rules:
- Be factual and specific. Reference the actual numbers you are given.
- Describe what the data shows; do NOT diagnose, do NOT give medical advice, and do NOT recommend treatment, medication, or dosage changes.
- Treat low-confidence trends as inconclusive rather than asserting a direction.
- A correlation with fewer than 3 paired days is insufficient data, not evidence of "no relationship".
- Correlation is not causation — never imply one metric causes another.
- Keep a neutral, non-alarming tone. If a reading looks notable, state the number plainly and suggest the user discuss it with a healthcare professional rather than interpreting it yourself.
- Always return your answer by calling the analytics_insight tool.`;

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function describeTrend(t: z.infer<typeof TrendSchema>): string {
  if (t.confidence < 0.3) return "no clear trend (low-confidence fit)";
  return `${t.direction} (confidence ${(t.confidence * 100).toFixed(0)}%)`;
}

function domainLabel(d: Domain): string {
  return DOMAIN_LABELS[d];
}

/**
 * Render the validated metrics snapshot into a plain-text briefing for the
 * model. Only the metric groups present in the request are included.
 */
export function buildInsightsPrompt(req: AnalyticsInsightsRequest): string {
  const { range, metrics } = req;
  const days = Math.max(
    1,
    Math.round((range.end - range.start) / (24 * 60 * 60 * 1000)),
  );
  const lines: string[] = [
    `Health metrics for a period of approximately ${days} day(s).`,
    "",
  ];

  if (metrics.bp) {
    const b = metrics.bp;
    lines.push(
      `Blood pressure: average ${b.avgSystolic.toFixed(0)}/${b.avgDiastolic.toFixed(0)} mmHg across ${b.readingCount} reading(s). ` +
        `Systolic trend: ${describeTrend(b.systolicTrend)}. Diastolic trend: ${describeTrend(b.diastolicTrend)}.`,
    );
  }

  if (metrics.weight) {
    const w = metrics.weight;
    lines.push(
      `Weight: average ${w.avg.toFixed(1)} kg (range ${w.min.toFixed(1)}-${w.max.toFixed(1)} kg) ` +
        `across ${w.readingCount} reading(s). Net change ${w.changeKg >= 0 ? "+" : ""}${w.changeKg.toFixed(1)} kg. ` +
        `Trend: ${describeTrend(w.trend)}.`,
    );
  }

  if (metrics.fluidBalance) {
    const f = metrics.fluidBalance;
    lines.push(
      `Fluid balance: average ${f.avgBalanceMl.toFixed(0)} ml/day (intake minus estimated output). ` +
        `On target on ${f.daysOnTarget} of ${f.daysTotal} day(s).`,
    );
  }

  if (metrics.intake) {
    const i = metrics.intake;
    lines.push(
      `Daily intake: water averaged ${i.avgWaterMl.toFixed(0)} ml against a ${i.waterGoalMl} ml goal; ` +
        `sodium averaged ${i.avgSodiumMg.toFixed(0)} mg against a ${i.sodiumLimitMg} mg limit.`,
    );
  }

  if (metrics.correlations && metrics.correlations.length > 0) {
    lines.push("", "Correlations:");
    for (const c of metrics.correlations) {
      const detail =
        c.pairedDays < 3
          ? `insufficient overlapping data (${c.pairedDays} day(s))`
          : `${c.strength} (r=${c.coefficient.toFixed(2)}, ${c.pairedDays} paired day(s))`;
      lines.push(
        `- ${domainLabel(c.domainA)} vs ${domainLabel(c.domainB)}: ${detail}`,
      );
    }
  }

  lines.push(
    "",
    "Summarise this period and list the most relevant observations. Call the analytics_insight tool.",
  );

  return lines.join("\n");
}
