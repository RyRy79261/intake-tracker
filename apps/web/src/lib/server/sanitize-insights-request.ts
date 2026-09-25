/**
 * Strip incidental PII from the free-text parts of an analytics insights
 * request before it reaches the model or `insight_jobs`.
 *
 * The metrics are numeric, but three fields are user- or model-authored text:
 * reported conditions, the medication list, and prior AI narratives (which
 * can quote the conditions back). The medical content is sent on purpose, so
 * this only redacts what doesn't belong in it — emails, phone numbers, ID
 * numbers — using the same helpers the nutrient-analysis route applies to the
 * same profile fields.
 */
import type { AnalyticsInsightsRequest } from "@intake/ai-prompts/analytics-insights";
import { sanitizeForAI, sanitizeReportText } from "@/lib/security";

// Mirror PriorAssessmentSchema's caps: sanitizeForAI's 500-char limit would
// cut a deep summary short.
const MAX_PRIOR_SUMMARY_CHARS = 4000;
const MAX_PRIOR_OBSERVATION_CHARS = 2000;

export function sanitizeInsightsRequest(
  req: AnalyticsInsightsRequest,
): AnalyticsInsightsRequest {
  const out: AnalyticsInsightsRequest = { ...req };

  if (req.profile) {
    const conditions = req.profile.conditions
      .map((c) => sanitizeForAI(c))
      .filter((c) => c.length > 0);
    const medications = req.profile.medications
      ?.map((m) => ({
        ...m,
        name: sanitizeForAI(m.name),
        dose: sanitizeForAI(m.dose),
        frequency: sanitizeForAI(m.frequency),
      }))
      .filter((m) => m.name.length > 0);
    out.profile = {
      conditions,
      ...(medications !== undefined && { medications }),
    };
  }

  if (req.priorAssessments) {
    out.priorAssessments = req.priorAssessments.map((p) => ({
      ...p,
      summary: sanitizeReportText(p.summary, MAX_PRIOR_SUMMARY_CHARS),
      observations: p.observations
        .map((o) => sanitizeReportText(o, MAX_PRIOR_OBSERVATION_CHARS))
        .filter((o) => o.length > 0),
    }));
  }

  return out;
}
