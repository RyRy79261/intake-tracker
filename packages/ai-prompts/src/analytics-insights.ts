/**
 * Schema, prompt construction, and response contract for the analytics
 * insights webhook (`POST /api/analytics/insights`).
 *
 * The request body is an intentionally narrow, fully numeric/enumerated
 * snapshot of computed analytics — no free text or record notes — so personal
 * health detail cannot reach the external AI call by construction. The webhook
 * caller computes the predefined analytics queries (the same ones the app runs
 * locally); this layer turns them into an AI-written narrative.
 *
 * The one exception is `priorAssessments`: when the user opts in, previously
 * generated AI summaries are sent back so the model can compare periods. These
 * are model-authored narratives derived from the same aggregate snapshot — not
 * raw records — but they are free text, so they only travel when the user
 * explicitly enables the comparison.
 */

import { z } from "zod";
import { DOMAINS, type Domain } from "@intake/types/analytics";

const DOMAIN_LABELS: Record<Domain, string> = {
  water: "water intake",
  salt: "sodium intake",
  sugar: "sugar intake",
  potassium: "potassium intake",
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

// Sugar and potassium are optional trackers — the snapshot only includes
// them when the user has the tracker enabled. Water and sodium always ship
// because they are the core fluid-balance / cardiovascular metrics.
const IntakeMetricSchema = z.object({
  avgWaterMl: z.number().nonnegative(),
  avgSodiumMg: z.number().nonnegative(),
  avgSugarG: z.number().nonnegative().optional(),
  avgPotassiumMg: z.number().nonnegative().optional(),
  waterGoalMl: z.number().positive(),
  sodiumLimitMg: z.number().positive(),
  sugarLimitG: z.number().positive().optional(),
  potassiumLimitMg: z.number().positive().optional(),
});

const CorrelationMetricSchema = z.object({
  domainA: z.enum(DOMAINS),
  domainB: z.enum(DOMAINS),
  coefficient: z.number().min(-1).max(1),
  strength: z.enum(["strong", "moderate", "weak", "none"]),
  pairedDays: z.number().int().nonnegative(),
});

/**
 * Per-field caps for the medication summary, shared with the producer
 * (buildMedicationSummary in apps/web) and the nutrient-analysis route's
 * duplicated schema so client-built strings can never exceed what the
 * request validators accept.
 */
export const MAX_MEDICATION_NAME_CHARS = 120;
export const MAX_MEDICATION_DOSE_CHARS = 80;
export const MAX_MEDICATION_FREQUENCY_CHARS = 120;

/**
 * A single active medication — the user's current prescription with its dose,
 * frequency, and how long the active maintenance/titration phase has run.
 */
const MedicationSchema = z.object({
  name: z.string().min(1).max(MAX_MEDICATION_NAME_CHARS),
  phaseType: z.enum(["maintenance", "titration"]),
  dose: z.string().min(1).max(MAX_MEDICATION_DOSE_CHARS),
  frequency: z.string().min(1).max(MAX_MEDICATION_FREQUENCY_CHARS),
  daysOnPhase: z.number().int().nonnegative(),
});

/**
 * Optional user-reported clinical context. Conditions are short, structured
 * labels (e.g. "HFrEF") and medications are the structured active-prescription
 * list — not free text or record notes. Both only reach this request when the
 * user has explicitly opted in on the profile page.
 */
const ProfileSchema = z.object({
  conditions: z.array(z.string().min(1).max(120)).max(20),
  medications: z.array(MedicationSchema).max(40).optional(),
});

/**
 * A previously generated AI assessment, sent back so the model can describe
 * how the current period compares. `summary` and `observations` are the
 * model's own earlier output; `rangeStart`/`rangeEnd` mark the window it
 * covered. Only present when the user opted in to including past summaries.
 */
const PriorAssessmentSchema = z.object({
  generatedAt: z.number(),
  rangeStart: z.number(),
  rangeEnd: z.number(),
  // Bound matches InsightResponseSchema below — see comment there for why
  // the deep-research ceiling is generous.
  summary: z.string().min(1).max(4000),
  observations: z.array(z.string().min(1).max(2000)).max(16),
  // URLs from the prior deep report's web_search citations. Sent back so
  // the model can avoid re-fetching sources it already grounded against.
  sources: z.array(z.url()).max(30).optional(),
});

export type PriorAssessment = z.infer<typeof PriorAssessmentSchema>;

export const AnalyticsInsightsRequestSchema = z.object({
  range: z
    .object({
      start: z.number(),
      end: z.number(),
    })
    .refine((r) => r.start <= r.end, {
      message: "range.start must be <= range.end",
    }),
  profile: ProfileSchema.optional(),
  priorAssessments: z.array(PriorAssessmentSchema).max(3).optional(),
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

// Caps sized for the deep-research path: Opus with web_search routinely
// produces longer summaries and longer observations (citations, clinical
// context, "this matters because…" framing). The fast path is well under
// these limits in normal use, so a single ceiling avoids a parallel schema.
//
// `sources` is the deep-mode citation list — URLs the model retrieved via
// web_search to ground its clinical claims. Optional so fast-mode reports
// (which never invoke web_search) can produce a valid tool input without
// populating it.
export const InsightResponseSchema = z.object({
  summary: z.string().min(1).max(4000),
  observations: z.array(z.string().min(1).max(2000)).max(16),
  sources: z.array(z.url()).max(30).optional(),
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
          "A 2-4 sentence plain-language overview of the period, referencing the actual numbers. In deep mode this can be longer (3-5 sentences) and weave in clinical context, condition framing, and medication-response alignment.",
      },
      observations: {
        type: "array",
        items: { type: "string" },
        description:
          "3-6 specific, factual observations in fast mode; 4-8 in deep mode. Each cites a concrete metric. In deep mode, observations should connect trends to the user's medications and conditions where applicable, and may cite a source URL inline.",
      },
      sources: {
        type: "array",
        items: { type: "string", format: "uri" },
        description:
          "Deep mode only: the URLs you retrieved via web_search to ground clinical claims. Required when web_search was used; omit when no external references back the observations.",
      },
    },
    required: ["summary", "observations"],
    additionalProperties: false,
  },
};

export const INSIGHTS_SYSTEM_PROMPT = `You summarise personal health-tracking metrics for a self-tracking app.

Rules:
- Be factual and specific. Reference the actual numbers you are given.
- Describe what the data shows. Do NOT diagnose new conditions, and do NOT recommend, prescribe, or suggest changes to treatment, medication, or dosage.
- If the user has supplied known medical conditions or a current medication list, you MAY use them as clinical context: explain why a tracked goal or limit matters for someone with that condition or treatment, and prioritise the observations most relevant to it (for example, framing fluid balance, sodium intake, and short-term weight change in the context of heart failure, or noting how long a titration phase has been running). Keep this as general, educational context — not personalised medical advice — and never act as the user's clinician.
- Treat low-confidence trends as inconclusive rather than asserting a direction.
- A correlation with fewer than 3 paired days is insufficient data, not evidence of "no relationship".
- Correlation is not causation — never imply one metric causes another.
- Keep a neutral, non-alarming tone. This summary is informational only and never replaces a qualified professional. If a reading looks notable, state the number plainly and recommend the user discuss it with their healthcare provider.
- If one or more previous assessments are supplied, compare the current period against the most recent one: note specifically what has changed, improved, or worsened, citing both the old and new numbers where possible. Do not simply repeat unchanged observations.
- Always return your answer by calling the analytics_insight tool.`;

export const DEEP_SYSTEM_PROMPT = `${INSIGHTS_SYSTEM_PROMPT}

You are running in DEEP mode. The fast path already does a structural
summary; your job is to add the *connective* analysis the fast model
cannot — relating trends to the user's conditions and medications, and
grounding clinical context in current literature. A deep summary that
reads identically to a fast one is a failure.

REQUIRED PROCESS:

1. Web search is mandatory. Before calling analytics_insight you MUST run
   at least 2 web_search queries. Target what would actually help: the
   published target range for the user's notable metric, the expected
   response pattern for one of their active medications in their
   condition, or current monitoring guidance for the condition. Skip
   searches that are not useful; do not pad the count.

2. Medication ↔ trend alignment. For EACH active medication in the user's
   profile, write at least one observation that compares the observed
   metric trend against the expected clinical response, framed
   descriptively (NOT prescriptively). Examples of the right shape:
     - "Average systolic BP held at 132 mmHg over the period. For
        bisoprolol in HFrEF this is within the typical early-titration
        range; published targets are <130 mmHg once the dose is stable
        [source URL]."
     - "Weight trended down 1.8 kg, consistent with the diuretic-adjacent
        effect frequently observed when bisoprolol is up-titrated in
        heart failure [source URL]."
   If you cannot find a credible source, say so and frame the observation
   as data-only.

3. Condition framing. Use the user's reported conditions to explain WHY a
   metric matters, citing a source for the framing claim. If their data
   is within the recommended range for their condition, say so plainly;
   if it is not, name the number and recommend they discuss it with their
   provider. Never diagnose new conditions and never recommend changes to
   medication, dose, or treatment.

4. Suggestions. End with 1-2 observations that suggest topics worth
   raising with their healthcare provider, OR lifestyle / tracking
   adjustments aligned with their goals (e.g., "logging morning vs.
   evening BP separately may help interpret the rising trend in the
   afternoon readings"). Stay observational; never prescribe.

5. Sources. Pass every URL you used via web_search in the analytics_insight
   tool's "sources" field. Inline source references inside observations
   are fine too, but the sources array is the canonical citation list.

Final answer must come via the analytics_insight tool exactly once, after
the web_search calls.`;

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
  const { range, metrics, profile, priorAssessments } = req;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const days = Math.max(1, Math.round((range.end - range.start) / MS_PER_DAY));
  const lines: string[] = [
    `Health metrics for a period of approximately ${days} day(s).`,
    "",
  ];

  if (profile && profile.conditions.length > 0) {
    lines.push(
      `User-reported medical conditions: ${profile.conditions.join("; ")}.`,
      "Use these as clinical context to explain why the tracked goals matter and to prioritise the most relevant observations. Do not diagnose new conditions or recommend treatment.",
      "",
    );
  }

  if (profile && profile.medications && profile.medications.length > 0) {
    lines.push("Current medications (user-reported):");
    for (const m of profile.medications) {
      lines.push(
        `- ${m.name}: ${m.phaseType} phase, ${m.dose}, ${m.frequency}; ` +
          `current phase active ${m.daysOnPhase} day(s).`,
      );
    }
    lines.push(
      "Use these only as context. Do not recommend, change, or suggest dosages.",
      "",
    );
  }

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
    const parts: string[] = [
      `water averaged ${i.avgWaterMl.toFixed(0)} ml against a ${i.waterGoalMl} ml goal`,
      `sodium averaged ${i.avgSodiumMg.toFixed(0)} mg against a ${i.sodiumLimitMg} mg limit`,
    ];
    if (i.avgSugarG !== undefined && i.sugarLimitG !== undefined) {
      parts.push(
        `sugar averaged ${i.avgSugarG.toFixed(0)} g against a ${i.sugarLimitG} g limit`,
      );
    }
    if (i.avgPotassiumMg !== undefined && i.potassiumLimitMg !== undefined) {
      parts.push(
        `potassium averaged ${i.avgPotassiumMg.toFixed(0)} mg against a ${i.potassiumLimitMg} mg soft target ` +
          `(estimates are rough — many foods are not labelled for potassium)`,
      );
    }
    lines.push(`Daily intake: ${parts.join("; ")}.`);
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

  if (priorAssessments && priorAssessments.length > 0) {
    lines.push(
      "",
      "Previous AI assessment(s) for earlier periods, most recent first:",
    );
    for (const p of priorAssessments) {
      const pDays = Math.max(
        1,
        Math.round((p.rangeEnd - p.rangeStart) / MS_PER_DAY),
      );
      const generatedOn = new Date(p.generatedAt).toISOString().slice(0, 10);
      lines.push(
        `- Generated ${generatedOn}, covering ~${pDays} day(s):`,
        `  Summary: ${p.summary}`,
      );
      for (const o of p.observations) lines.push(`  - ${o}`);
      if (p.sources && p.sources.length > 0) {
        lines.push(`  Sources previously cited: ${p.sources.join(", ")}`);
      }
    }
    lines.push(
      "",
      "Compare the current period against the most recent assessment above and call out what changed.",
    );
  }

  lines.push(
    "",
    "Summarise this period and list the most relevant observations. Call the analytics_insight tool.",
  );

  return lines.join("\n");
}
