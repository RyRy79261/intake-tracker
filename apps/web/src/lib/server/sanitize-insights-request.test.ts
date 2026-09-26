import { describe, it, expect } from "vitest";
import { sanitizeInsightsRequest } from "@/lib/server/sanitize-insights-request";
import type { AnalyticsInsightsRequest } from "@intake/ai-prompts/analytics-insights";

function request(
  overrides: Partial<AnalyticsInsightsRequest> = {},
): AnalyticsInsightsRequest {
  return {
    range: { start: 1_000, end: 2_000 },
    metrics: {
      intake: {
        avgWaterMl: 1800,
        avgSodiumMg: 2100,
        waterGoalMl: 2500,
        sodiumLimitMg: 2300,
      },
    },
    ...overrides,
  };
}

describe("sanitizeInsightsRequest", () => {
  it("redacts incidental PII from conditions, the same way nutrient analysis does", () => {
    const out = sanitizeInsightsRequest(
      request({
        profile: {
          conditions: ["CKD stage 3 - Dr Smith 082-555-1234", "HFrEF"],
        },
      }),
    );
    expect(out.profile!.conditions).toEqual([
      "CKD stage 3 - Dr Smith [phone]",
      "HFrEF",
    ]);
  });

  it("redacts medication name, dose and frequency but keeps the structure", () => {
    const out = sanitizeInsightsRequest(
      request({
        profile: {
          conditions: [],
          medications: [
            {
              name: "Bisoprolol (ask nurse@clinic.test)",
              phaseType: "titration",
              dose: "5 mg",
              frequency: "once daily",
              daysOnPhase: 12,
            },
          ],
        },
      }),
    );
    expect(out.profile!.medications).toEqual([
      {
        name: "Bisoprolol (ask [email])",
        phaseType: "titration",
        dose: "5 mg",
        frequency: "once daily",
        daysOnPhase: 12,
      },
    ]);
  });

  it("redacts prior narratives without truncating them to the short-field cap", () => {
    const long = `${"Water averaged 1800 ml. ".repeat(40)}Call +27 82 555 1234.`;
    const out = sanitizeInsightsRequest(
      request({
        priorAssessments: [
          {
            generatedAt: 1,
            rangeStart: 0,
            rangeEnd: 1,
            summary: long,
            observations: ["Emailed to me@example.test"],
          },
        ],
      }),
    );
    const prior = out.priorAssessments![0]!;
    expect(prior.summary).toContain("[phone]");
    expect(prior.summary.length).toBeGreaterThan(500);
    expect(prior.observations).toEqual(["Emailed to [email]"]);
  });

  it("leaves a request with no free text unchanged", () => {
    const input = request();
    expect(sanitizeInsightsRequest(input)).toEqual(input);
  });
});
