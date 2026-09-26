import { describe, it, expect } from "vitest";
import {
  AnalyticsInsightsRequestSchema,
  buildInsightsPrompt,
} from "@intake/ai-prompts/analytics-insights";

const validBp = {
  avgSystolic: 128,
  avgDiastolic: 82,
  readingCount: 14,
  systolicTrend: { direction: "rising", slope: 0.5, confidence: 0.7 },
  diastolicTrend: { direction: "stable", slope: 0.01, confidence: 0.1 },
};

describe("AnalyticsInsightsRequestSchema", () => {
  it("accepts a payload with a single metric group", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      metrics: { bp: validBp },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payload with no metric groups", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      metrics: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty correlations array as the only metric", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      metrics: { correlations: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown correlation domain", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      metrics: {
        correlations: [
          {
            domainA: "water",
            domainB: "sleep",
            coefficient: 0.5,
            strength: "moderate",
            pairedDays: 5,
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a correlation coefficient outside [-1, 1]", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      metrics: {
        correlations: [
          {
            domainA: "water",
            domainB: "weight",
            coefficient: 1.5,
            strength: "strong",
            pairedDays: 5,
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional profile with conditions", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      profile: { conditions: ["HFrEF", "Idiopathic dilated cardiomyopathy"] },
      metrics: { bp: validBp },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a profile whose only context is present but has no metrics", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      profile: { conditions: ["HFrEF"] },
      metrics: {},
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional priorAssessments", () => {
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      metrics: { bp: validBp },
      priorAssessments: [
        {
          generatedAt: 500,
          rangeStart: 0,
          rangeEnd: 500,
          summary: "Earlier period summary.",
          observations: ["BP averaged 130/85 mmHg."],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 3 priorAssessments", () => {
    const assessment = {
      generatedAt: 500,
      rangeStart: 0,
      rangeEnd: 500,
      summary: "Earlier period summary.",
      observations: ["BP averaged 130/85 mmHg."],
    };
    const result = AnalyticsInsightsRequestSchema.safeParse({
      range: { start: 0, end: 1000 },
      metrics: { bp: validBp },
      priorAssessments: [assessment, assessment, assessment, assessment],
    });
    expect(result.success).toBe(false);
  });
});

describe("buildInsightsPrompt", () => {
  it("includes BP numbers and treats a low-confidence trend as inconclusive", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 7 * 86_400_000 },
      metrics: { bp: validBp },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).toContain("128/82 mmHg");
    expect(prompt).toContain("14 reading");
    // diastolic trend confidence 0.1 is below the 0.3 gate.
    expect(prompt).toContain("no clear trend");
  });

  it("includes user-reported conditions when a profile is supplied", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 7 * 86_400_000 },
      profile: { conditions: ["HFrEF", "Idiopathic dilated cardiomyopathy"] },
      metrics: { bp: validBp },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).toContain("User-reported medical conditions");
    expect(prompt).toContain("HFrEF");
    expect(prompt).toContain("Idiopathic dilated cardiomyopathy");
  });

  it("includes active medications when supplied in the profile", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 7 * 86_400_000 },
      profile: {
        conditions: [],
        medications: [
          {
            name: "Bisoprolol",
            phaseType: "titration",
            dose: "2.5 mg",
            frequency: "once daily",
            daysOnPhase: 12,
          },
        ],
      },
      metrics: { bp: validBp },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).toContain("Current medications");
    expect(prompt).toContain("Bisoprolol");
    expect(prompt).toContain("titration phase");
    expect(prompt).toContain("2.5 mg");
    expect(prompt).toContain("12 day(s)");
  });

  it("omits the conditions line when no profile is supplied", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 7 * 86_400_000 },
      metrics: { bp: validBp },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).not.toContain("User-reported medical conditions");
  });

  it("flags a correlation with fewer than 3 paired days as insufficient data", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 86_400_000 },
      metrics: {
        correlations: [
          {
            domainA: "salt",
            domainB: "weight",
            coefficient: 0,
            strength: "none",
            pairedDays: 2,
          },
        ],
      },
    });
    const prompt = buildInsightsPrompt(req);
    expect(prompt).toContain("insufficient overlapping data");
  });

  it("renders prior assessments and asks the model to compare periods", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 30 * 86_400_000 },
      metrics: { bp: validBp },
      priorAssessments: [
        {
          generatedAt: 30 * 86_400_000,
          rangeStart: 0,
          rangeEnd: 30 * 86_400_000,
          summary: "Sodium averaged 2400 mg over the prior month.",
          observations: ["Weight rose 0.8 kg."],
        },
      ],
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).toContain("Previous AI assessment(s)");
    expect(prompt).toContain("Sodium averaged 2400 mg over the prior month.");
    expect(prompt).toContain("Weight rose 0.8 kg.");
    expect(prompt).toContain("Compare the current period");
  });

  it("omits the prior-assessment section when none are supplied", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 7 * 86_400_000 },
      metrics: { bp: validBp },
    });
    const prompt = buildInsightsPrompt(req);
    expect(prompt).not.toContain("Previous AI assessment(s)");
  });

  it("frames the water setting as a daily fluid limit, never a goal", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 30 * 86_400_000 },
      metrics: {
        intake: { avgWaterMl: 1200, waterLoggedDays: 25, waterLimitMl: 1500 },
      },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).toContain("1500 ml daily fluid limit");
    expect(prompt).toContain("on the 25 day(s) it was logged");
    expect(prompt).not.toMatch(/ml goal/);
  });

  it("still accepts the legacy waterGoalMl name and renders it as a limit", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 30 * 86_400_000 },
      metrics: {
        intake: { avgWaterMl: 1200, avgSodiumMg: 1400, waterGoalMl: 1500, sodiumLimitMg: 2000 },
      },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).toContain("1500 ml daily fluid limit");
    expect(prompt).not.toMatch(/ml goal/);
  });

  it("omits intake types that were not logged instead of reporting zero", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 30 * 86_400_000 },
      metrics: {
        intake: { avgSugarG: 40, sugarLoggedDays: 1, sugarLimitG: 30 },
      },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).toContain("sugar averaged 40 g/day on the 1 day(s) it was logged");
    expect(prompt).not.toContain("water averaged");
    expect(prompt).not.toContain("fluid intake averaged");
    expect(prompt).not.toContain("sodium averaged");
    expect(prompt).toContain("not logged");
  });

  it("includes caffeine and alcohol daily averages", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 30 * 86_400_000 },
      metrics: {
        intake: {
          avgCaffeineMg: 180,
          caffeineLoggedDays: 20,
          avgAlcoholStdDrinks: 4,
          alcoholLoggedDays: 28,
        },
      },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).toContain("caffeine averaged 180 mg/day on the 20 day(s)");
    expect(prompt).toContain("alcohol averaged 4.0 standard drink(s)/day on the 28 day(s)");
  });

  it("defines the fluid-balance marker instead of calling it a target", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 30 * 86_400_000 },
      metrics: {
        fluidBalance: { avgBalanceMl: 100, daysOnTarget: 3, daysTotal: 25 },
      },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).not.toContain("On target");
    expect(prompt).toContain("at least 500 ml on 3 of 25 day(s)");
    expect(prompt).toContain("not a goal");
  });

  it("renders PRN medications and per-medication adherence", () => {
    const req = AnalyticsInsightsRequestSchema.parse({
      range: { start: 0, end: 30 * 86_400_000 },
      profile: {
        conditions: [],
        medications: [
          {
            name: "Furosemide",
            phaseType: "prn",
            dose: "40 mg",
            frequency: "as needed",
            daysOnPhase: 90,
            prnDoses: 5,
          },
          {
            name: "Bisoprolol",
            phaseType: "maintenance",
            dose: "5 mg",
            frequency: "once daily",
            daysOnPhase: 200,
            dosesTaken: 27,
            dosesDue: 30,
          },
          {
            name: "Spironolactone",
            phaseType: "maintenance",
            dose: "25 mg",
            frequency: "once daily",
            daysOnPhase: 200,
            dosesTaken: 0,
            dosesDue: 30,
          },
          {
            name: "Ramipril",
            phaseType: "titration",
            dose: "5 mg",
            frequency: "once daily",
            daysOnPhase: 3,
          },
        ],
      },
      metrics: { bp: validBp },
    });
    const prompt = buildInsightsPrompt(req);

    expect(prompt).toContain("Furosemide: as needed (PRN");
    expect(prompt).toContain("5 as-needed dose(s) logged");
    expect(prompt).toContain("27 of 30 scheduled dose(s) logged as taken (90%)");
    expect(prompt).toMatch(/Spironolactone.*treat adherence as unknown/);
    expect(prompt).toMatch(/Ramipril.*adherence unknown/);
  });
});
